import cors from 'cors';
import express from 'express';
import { generateArtifact, generateGraph } from './graph.js';

const app = express();
const PORT = 8787;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/topic-graph', async (request, response) => {
  const topic = String(request.body?.topic ?? '').trim();
  const provider = request.body?.provider ?? { mode: 'mock' };

  if (!topic) {
    response.status(400).send('A topic is required.');
    return;
  }

  try {
    const graph = await generateGraph(topic, provider);
    response.json(graph);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : 'Failed to generate topic graph.');
  }
});

app.post('/api/expand-node', async (request, response) => {
  const topic = String(request.body?.topic ?? '').trim();
  const node = request.body?.node;
  const provider = request.body?.provider ?? { mode: 'mock' };

  if (!topic || !node?.id || !node?.title) {
    response.status(400).send('A topic and node are required for expansion.');
    return;
  }

  try {
    const graph = await generateGraph(topic, provider, node);
    response.json(graph);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : 'Failed to expand the concept node.');
  }
});

app.post('/api/generate-artifact', async (request, response) => {
  const node = request.body?.node;
  const topic = String(request.body?.topic ?? '').trim();
  const provider = request.body?.provider ?? { mode: 'mock' };

  if (!topic || !node?.id || !node?.title) {
    response.status(400).send('A topic and node are required to render an artifact.');
    return;
  }

  try {
    const artifact = await generateArtifact(node, topic, provider);
    response.json(artifact);
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : 'Failed to render concept artifact.');
  }
});

app.listen(PORT, () => {
  console.log(`Vera backend listening on http://localhost:${PORT}`);
});
