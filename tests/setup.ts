process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.MESSAGE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.CORS_ORIGINS = 'http://localhost:5173';
