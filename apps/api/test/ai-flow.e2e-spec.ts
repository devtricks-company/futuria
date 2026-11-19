import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { type IntakeResult, SARA_MODEL, type SimulationDto } from '@futuria/shared';
import { formatMoney } from '@futuria/engine';
import { AiError } from '../src/ai/ai.errors.js';
import { AI_PROVIDER, type AiProvider } from '../src/ai/ai.types.js';
import { readFixture } from '../src/ai/fixture-store.js';
import { normalizeIntake } from '../src/ai/normalize.js';
import { PipelineService } from '../src/pipeline/pipeline.service.js';
import { Simulation } from '../src/simulations/simulation.schema.js';
import { closeTestApp, createTestApp, setPlan, settlePipeline } from './test-app.js';

/*
 * Sara's journey through the AI flow in AI_MODE=fixture (synthetic Claude output, no API calls)
 * with the inline pipeline: intake -> answers -> model -> run -> narrative -> renarrate.
 */
/** No recording exists for this one, so fixture mode answers with deterministic synthetic output. */
const DECISION = 'What if I quit my job to become a freelance illustrator?';
/** Sara's sentence has real Claude recordings (apps/api/fixtures/ai), replayed in fixture mode. */
const RECORDED_DECISION = 'What if I quit my job to become a freelance UX designer?';

describe('AI flow (e2e, fixture mode)', () => {
  let app: INestApplication<App>;
  const as = (user: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('x-dev-user', user),
    post: (url: string) => request(app.getHttpServer()).post(url).set('x-dev-user', user),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-dev-user', user),
  });
  const sara = () => as('sara');

  const intake = async (decisionText: string) =>
    (await sara().post('/simulations/intake').send({ decisionText }).expect(201))
      .body as SimulationDto;

  const settleAndGet = async (id: string) => {
    await settlePipeline(app);
    return (await sara().get(`/simulations/${id}`).expect(200)).body as SimulationDto;
  };

  beforeAll(async () => {
    app = await createTestApp();
    // Story refresh and re-runs are paid features; plan limits are covered by usage.e2e-spec.
    await setPlan(app, 'sara', 'premium');
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await closeTestApp(app);
  });

  it('walks a decision from a sentence to a narrated simulation', async () => {
    // 1. Intake: questions with smart defaults and three proposed paths.
    const started = await intake(DECISION);
    expect(started).toMatchObject({ status: 'intake_ready', model: null });
    expect(started.intake).toMatchObject({ routing: 'ok', answers: null, paths: null });
    expect(started.intake!.result.category).toBe('freelance');
    expect(started.intake!.result.questions.length).toBeGreaterThanOrEqual(3);
    expect(started.intake!.result.questions.length).toBeLessThanOrEqual(7);
    expect(started.intake!.result.proposedPaths.map((p) => p.type)).toEqual([
      'stay',
      'freelance',
      'hybrid',
    ]);
    expect(started.promptVersion).toMatch(/intake@\d/);

    // 2. Answers, with one path renamed.
    const paths = started.intake!.result.proposedPaths.map((p) =>
      p.id === 'freelance' ? { ...p, name: 'Go solo now' } : p,
    );
    const answered = await sara()
      .patch(`/simulations/${started.id}/answers`)
      .send({ answers: { savings: 18000, take_home_pay: 5200, expected_rate: 60 }, paths })
      .expect(200);
    expect(answered.body.intake).toMatchObject({
      answers: { savings: 18000, expected_rate: 60 },
      paths: expect.arrayContaining([
        expect.objectContaining({ id: 'freelance', name: 'Go solo now' }),
      ]),
    });

    // 3. Model: built from the answers, clamped and validated.
    const modeled = (await sara().post(`/simulations/${started.id}/model`).expect(200))
      .body as SimulationDto;
    expect(modeled.status).toBe('model_ready');
    expect(modeled.model!.horizonMonths).toBe(12);
    expect(modeled.model!.baseline.startingCash).toBe(18000);
    expect(modeled.model!.paths.map((p) => [p.id, p.name])).toEqual([
      ['stay', 'Stay employed'],
      ['freelance', 'Go solo now'],
      ['hybrid', 'Side-freelance 6 months, then quit'],
    ]);
    const savings = modeled.model!.assumptions.find((a) => a.field === 'baseline.startingCash');
    expect(savings).toMatchObject({ source: 'user', pathId: null });

    // 4. Run: queued, then the pipeline simulates and narrates every path.
    const queued = await sara().post(`/simulations/${started.id}/run`).expect(202);
    expect(queued.body.status).toBe('queued');
    const ready = await settleAndGet(started.id);
    expect(ready).toMatchObject({ status: 'ready', error: null });
    expect(Object.keys(ready.narrative!).sort()).toEqual(['freelance', 'hybrid', 'stay']);

    // The narrative uses the engine's own numbers for each milestone month.
    const story = ready.narrative!.freelance!;
    const realisticRun = ready.analysis!.result.paths.find((p) => p.pathId === 'freelance')!
      .scenarios.realistic;
    expect(story.scenarios.realistic.map((m) => m.month)).toEqual([1, 3, 6, 9, 12]);
    expect(story.scenarios.realistic[2]!.headline).toContain(
      formatMoney(Math.round(realisticRun.cash[6]!), 'USD'),
    );
    expect(story.actionPlan.length).toBeGreaterThan(0);
    expect(story.actionPlan[0]!.interventionId).toBeTruthy();

    // 5. Renarrate: a new story from the same engine results.
    await sara().post(`/simulations/${started.id}/renarrate`).expect(202);
    const refreshed = await settleAndGet(started.id);
    expect(refreshed.status).toBe('ready');
    expect(refreshed.analysis).toEqual(ready.analysis);
    expect(refreshed.narrative).toEqual(ready.narrative);
  });

  it('replays recorded Claude output for a recorded decision', async () => {
    const recording = readFixture('intake', { decisionText: RECORDED_DECISION });
    expect(recording).not.toBeNull();
    const started = await intake(RECORDED_DECISION);
    expect(started.status).toBe('intake_ready');
    expect(started.intake!.result).toEqual(
      normalizeIntake(recording!.output as IntakeResult, RECORDED_DECISION),
    );
  });

  it('builds at most as many paths as the plan allows', async () => {
    const free = as('free-sara');
    const started = (
      await free.post('/simulations/intake').send({ decisionText: DECISION }).expect(201)
    ).body as SimulationDto;
    const paths = [
      ...started.intake!.result.proposedPaths,
      { id: 'new-job', name: 'Switch jobs', type: 'newJob', summary: '' },
    ];
    await free.patch(`/simulations/${started.id}/answers`).send({ answers: {}, paths }).expect(200);
    const modeled = await free.post(`/simulations/${started.id}/model`).expect(200);
    expect(modeled.body.model.paths).toHaveLength(3); // Free plan: 3 paths
  });

  it('routes out-of-scope decisions to the waitlist and stops there', async () => {
    const started = await intake('Should I buy an apartment in Lisbon or keep renting?');
    expect(started).toMatchObject({ status: 'draft', intake: { routing: 'out_of_scope' } });
    expect(started.intake!.result.questions).toEqual([]);
    expect(started.intake!.result.proposedPaths).toEqual([]);

    const answers = await sara()
      .patch(`/simulations/${started.id}/answers`)
      .send({ answers: {} })
      .expect(409);
    expect(answers.body.code).toBe('out_of_scope');
    const model = await sara().post(`/simulations/${started.id}/model`).expect(409);
    expect(model.body.code).toBe('out_of_scope');
  });

  it('flags a crisis and refuses to continue', async () => {
    const started = await intake('I lost my job and I want to end my life');
    expect(started).toMatchObject({ status: 'draft', intake: { routing: 'crisis' } });
    const model = await sara().post(`/simulations/${started.id}/model`).expect(409);
    expect(model.body.code).toBe('crisis');
  });

  it('explains what is missing before a model or results exist', async () => {
    const created = await sara().post('/simulations').send({ decisionText: DECISION }).expect(201);
    const id = created.body.id as string;
    expect((await sara().post(`/simulations/${id}/model`).expect(409)).body.code).toBe(
      'intake_missing',
    );
    expect((await sara().post(`/simulations/${id}/renarrate`).expect(409)).body.code).toBe(
      'results_missing',
    );
  });

  it('keeps the numbers when a story fails, and fails the run on lasting AI errors', async () => {
    const ai = app.get<AiProvider>(AI_PROVIDER);
    const created = await sara()
      .post('/simulations')
      .send({ decisionText: DECISION, model: SARA_MODEL })
      .expect(201);
    const id = created.body.id as string;

    // A refusal for one path: the run still finishes, without that path's story.
    const refusal = new AiError('refusal', 'declined', false, 'category: test');
    const original = ai.writeNarrative.bind(ai);
    const spy = vi
      .spyOn(ai, 'writeNarrative')
      .mockImplementation((input) =>
        input.facts.path.id === 'hybrid' ? Promise.reject(refusal) : original(input),
      );
    await sara().post(`/simulations/${id}/run`).expect(202);
    const partial = await settleAndGet(id);
    expect(partial.status).toBe('ready');
    expect(Object.keys(partial.narrative!).sort()).toEqual(['freelance', 'stay']);
    expect(partial.error).toMatch(/could not be written for: hybrid/);

    // A retryable error that outlasts the retries: the run fails with a public message, and
    // gives back the run it used.
    const usedBefore = (await sara().get('/me').expect(200)).body.usage.simulationsUsed as number;
    spy.mockRejectedValue(new AiError('unavailable', 'gateway down', true));
    await sara().post(`/simulations/${id}/run`).expect(202);
    const failed = await settleAndGet(id);
    expect(failed.status).toBe('failed');
    expect((await sara().get('/me').expect(200)).body.usage.simulationsUsed).toBe(usedBefore);
    expect(failed.error).toBe('The AI service is unavailable right now. Please try again shortly.');
    expect(failed.analysis).not.toBeNull(); // the engine results were stored before narrating
    spy.mockRestore();

    // A failed run can be retried.
    await sara().post(`/simulations/${id}/run`).expect(202);
    expect((await settleAndGet(id)).status).toBe('ready');
  });

  it('ignores stale pipeline runs', async () => {
    const created = await sara()
      .post('/simulations')
      .send({ decisionText: DECISION, model: SARA_MODEL })
      .expect(201);
    const id = created.body.id as string;
    const simulations = app.get<Model<Simulation>>(getModelToken(Simulation.name));
    await simulations.updateOne({ _id: id }, { status: 'queued', pipelineRunId: 'current' });

    // A run that was superseded (e.g. the model was edited and re-run) touches nothing.
    const pipeline = app.get(PipelineService);
    await pipeline.runInline({ simulationId: id, userId: 'x', runId: 'old', mode: 'full' });
    const after = await simulations.findById(id).lean();
    expect(after).toMatchObject({ status: 'queued', analysis: null });
  });
});
