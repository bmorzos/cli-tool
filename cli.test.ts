import axios, { AxiosError } from 'axios';
import { 
  TestItem, 
  FormattedResult,
  generateFormattedReport, 
  filterDataByColor, 
  formatResult, 
  main, 
  BASE_URL, 
  MAX_POLL_ATTEMPTS,
  logError
} from './qa-cli';
import * as readline from 'readline/promises';

// --- MOCKS ---

jest.mock('axios');

jest.mock('readline/promises', () => ({
  createInterface: jest.fn().mockReturnValue({
    question: jest.fn(),
    close: jest.fn(),
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Fake timers for polling tests
jest.useFakeTimers();

// Helper to strip ANSI codes
const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

// --- TEST DATA ---

const mockApiData = {
  data: [
    { id: 1, color: 'Red', status: 'Pass', value: 'Test 1' },
    { id: 2, color: 'TestColor', status: 'Fail', value: 'Test 2' },
  ]
};

const mockFormattedResult: FormattedResult = {
  Red: {
    pass: [{ id: 1, color: 'Red', status: 'Pass', value: 'Test 1' } as TestItem],
    fail: [],
    pending: [],
    skipped: [],
  },
  'TestColor': {
    pass: [],
    fail: [{ id: 2, color: 'TestColor', status: 'Fail', value: 'Test 2', errorDetails: 'Critical Error' } as TestItem],
    pending: [],
    skipped: [],
  }
};

// --- TESTS ---

describe('CLI Tool', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let stdoutWriteSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  const mockCreateInterface = readline.createInterface as jest.Mock;
  let mockQuestion: jest.Mock;
  let mockClose: jest.Mock;
  let originalArgv: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`Process Exit ${code}`); });

    mockQuestion = jest.fn();
    mockClose = jest.fn();
    mockCreateInterface.mockReturnValue({
      question: mockQuestion,
      close: mockClose,
    });
    
    originalArgv = process.argv;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.argv = originalArgv;
  });

  describe('Unit Logic', () => {
    it('filterDataByColor should be case-insensitive', () => {
      const result = filterDataByColor(mockApiData.data as TestItem[], ['TESTCOLOR']);
      expect(result).toHaveLength(1);
      expect(result[0].color).toBe('TestColor');
    });

    it('formatResult should return simplified, clean output', () => {
      const cleanOutput = stripAnsi(formatResult(mockFormattedResult));
      expect(cleanOutput).toContain('### Group: Red ###');
      expect(cleanOutput).toContain('• FAIL (1)');
      expect(cleanOutput).toContain('└> Error: Critical Error...');
    });

    it('formatResult should handle empty data gracefully', () => {
      const output = formatResult({});
      expect(stripAnsi(output)).toContain('No formatted data to display');
    });
  });

  describe('generateFormattedReport (Integration)', () => {
    it('should execute the full flow successfully', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockImplementation((url) => {
        if (url.endsWith('/test-format')) return Promise.resolve({ data: { id: 'job-123' } });
        if (url.endsWith('/retrieve')) return Promise.resolve({ data: { file: mockFormattedResult } });
        return Promise.reject(new Error('Unknown URL'));
      });

      await generateFormattedReport({ colors: 'red' });
      
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Job ID: job-123');
      expect(logOutput).toContain(' ██    ██ ██ ▀██ ██▀██ ██▄▄▄');
    });

    it('should handle cases where filter matches nothing', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      
      await generateFormattedReport({ colors: 'magenta' }); // No magenta in mockApiData
      
      const warnOutput = stripAnsi(consoleWarnSpy.mock.calls.flat().join('\n'));
      expect(warnOutput).toContain('No items matched your color filter');
      // Should not proceed to post
      expect(mockedAxios.post).not.toHaveBeenCalled(); 
    });

    it('should timeout if polling exceeds MAX_POLL_ATTEMPTS', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockImplementation((url) => {
        if (url.endsWith('/test-format')) return Promise.resolve({ data: { id: 'job-123' } });
        if (url.endsWith('/retrieve')) return Promise.resolve({ data: { file: undefined } });
        return Promise.reject();
      });

      const flowPromise = generateFormattedReport({ colors: 'red' });
      
      for (let i = 0; i < MAX_POLL_ATTEMPTS + 2; i++) {
        await jest.advanceTimersByTimeAsync(3000); 
      }
      await flowPromise;

      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Polling timed out');
    });
  });

  describe('Command: api-info', () => {
     it('should fetch and display help text', async () => {
        process.argv = ['node', 'cli.ts', 'api-info'];
        mockedAxios.get.mockResolvedValue({ data: 'Server Help Message' });

        await main();

        expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/help`);
        const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
        expect(logOutput).toContain('Server Help Message');
     });

     it('should handle errors when fetching help', async () => {
        process.argv = ['node', 'cli.ts', 'api-info'];
        mockedAxios.get.mockRejectedValue(new Error('Network Error'));

        await main();

        const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
        expect(errorOutput).toContain('Network Error');
     });
  });

  describe('Command: api-call', () => {
    it('should send a GET request', async () => {
      process.argv = ['node', 'cli.ts', 'api-call', 'GET', '/help'];
      
      // [FIX] Cast mockedAxios to jest.Mock to access mockResolvedValue
      (mockedAxios as unknown as jest.Mock).mockResolvedValue({ 
        status: 200, 
        data: 'Help Text', 
        statusText: 'OK', 
        headers: {}, 
        config: {} as any 
      });

      await main();

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/help')
      }));
      
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Status: 200');
    });

    it('should send a POST request with JSON data', async () => {
      const payload = '{"foo":"bar"}';
      process.argv = ['node', 'cli.ts', 'api-call', 'POST', 'upload', '--data', payload];
      
      // [FIX] Cast mockedAxios to jest.Mock
      (mockedAxios as unknown as jest.Mock).mockResolvedValue({ 
        status: 201, 
        data: { success: true }, 
        statusText: 'Created', 
        headers: {}, 
        config: {} as any 
      });

      await main();

      expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/upload'),
        data: { foo: 'bar' }
      }));
    });

    it('should handle 404s correctly', async () => {
      process.argv = ['node', 'cli.ts', 'api-call', 'POST', 'missing-endpoint'];
      
      const error404 = {
        isAxiosError: true,
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: { error: 'Not Found' }
        }
      };

      mockedAxios.isAxiosError.mockReturnValue(true);
      
      // [FIX] Cast mockedAxios to jest.Mock
      (mockedAxios as unknown as jest.Mock).mockRejectedValue(error404);

      await main();

      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Status: 404');
      expect(errorOutput).toContain('Not Found');
    });
  });

  describe('Interactive Mode', () => {
    it('should parse typed commands', async () => {
      process.argv = ['node', 'cli.ts'];
      
      mockQuestion
        .mockResolvedValueOnce('report -c red')
        .mockResolvedValueOnce('q');

      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockResolvedValue({ data: { id: 'job-1', file: mockFormattedResult } });

      await main();
      expect(mockedAxios.get).toHaveBeenCalled();
    });
    
    it('should handle exit commands', async () => {
        process.argv = ['node', 'cli.ts'];
        mockQuestion.mockResolvedValueOnce('exit');
        await main();
        expect(mockClose).toHaveBeenCalled();
    });
  });
  
  describe('Error Handling (Edge Cases)', () => {
     it('logError should handle non-axios errors', () => {
         logError(new Error('Generic Error'));
         const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
         expect(errorOutput).toContain('Generic Error');
     });
     
     it('should handle yargs failure', async () => {
         process.argv = ['node', 'cli.ts', 'report', '--unknown'];
         try {
             await main();
         } catch (e) {
             // Expected process.exit to throw in test
         }
         expect(processExitSpy).toHaveBeenCalledWith(1);
     });
  });
});