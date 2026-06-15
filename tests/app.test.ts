import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app';

describe('HTTP baseline', () => {
  it('returns health status with security headers', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns a structured 404 response', async () => {
    const response = await request(app).get('/api/nao-existe');
    expect(response.status).toBe(404);
    expect(response.body.requestId).toBeTruthy();
  });

  it('allows the configured frontend origin', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
