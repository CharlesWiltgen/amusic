// Common test data and fixtures used across test files

// Selected sample files for testing
export const SAMPLE_FILES = {
  MP3: "mp3_sample_512kb.mp3",
  FLAC: "flac_sample_3mb.flac",
  OGG: "ogg_sample_512kb.ogg",
} as const;

// Mock API responses
export const MOCK_API_RESPONSES = {
  SUCCESS: {
    status: "ok",
    results: [{ id: "uuid1", score: 0.95 }],
  },
  NO_RESULTS: {
    status: "ok",
    results: [],
  },
  ERROR: {
    status: "error",
    error: { message: "Invalid API key" },
  },
} as const;

// Mock fingerprint data
export const MOCK_FINGERPRINTS = {
  DEFAULT: "dummyfingerprint123",
  ALTERNATIVE: "alternativefingerprint456",
} as const;

// Mock AcoustID data
export const MOCK_ACOUSTID = {
  ID: "id12345",
  FINGERPRINT: "fingerprint67890",
} as const;

// Test API keys
export const TEST_API_KEYS = {
  DUMMY: "testdummyapikey",
  ENV: "env_test_key",
} as const;
