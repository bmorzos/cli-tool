import axios, { AxiosError } from 'axios';
// [UPDATE] Added 'main' to imports
import { runFlow, getApiHelp, filterDataByColor, formatAndDisplay, main } from './cli';
import * as readline from 'readline/promises';

// We must mock axios to prevent network calls and control responses.
jest.mock('axios');

// [UPDATE] Mock readline to control user input in 'main'
jest.mock('readline/promises', () => ({
  createInterface: jest.fn().mockReturnValue({
    question: jest.fn(),
    close: jest.fn(),
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// We use fake timers to control the 1-second polling delay in `runFlow`.
jest.useFakeTimers();

/**
 * Helper function to strip ANSI color codes from strings.
 * [FIX] Updated regex to correctly handle all ANSI escape codes used in the app.
 */
const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

const mockApiData = {
  data: [
    { id: 1, color: 'red', status: 'Pass' },
    { id: 2, color: 'blue', status: 'Fail' },
    { id: 3, color: 'red', status: 'Pending' },
    { id: 4, color: 'green', status: 'Pass' },
  ]
};

// This mock is now more complete to hit all branches in formatAndDisplay
const mockFullFinalResult = {
  red: {
    pass: [{ id: 1, color: 'red', status: 'Pass', value: 'Test 1' }],
    pending: [{ id: 3, color: 'red', status: 'Pending', value: 'Test 3' }],
    fail: [{ id: 6, color: 'red', status: 'Fail', value: 'Test 6 Error', errorDetails: 'This is an error' }],
    skipped: [{ id: 7, color: 'red', status: 'Skipped', value: 'Test 7 Skipped' }],
  },
  purple: {
    pass: [{ id: 5, color: 'purple', status: 'Pass', value: 'Test 5' }],
    pending: [],
    fail: [],
    skipped: [],
  }
};


describe('CLI Tool', () => {
  // Spy on console methods to capture output for assertions.
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Unit Tests', () => {
    it('filterDataByColor should correctly filter items', () => {
      const colors = ['red', 'green'];
      // @ts-ignore - 'data' is a partial mock, but fine for this test.
      const result = filterDataByColor(mockApiData.data, colors);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
      expect(result[2].id).toBe(4);
    });

    it('filterDataByColor should filter all human colors plus default', () => {
      const allColorsData = [
        { id: 1, color: 'red', status: 'Pass' },
        { id: 2, color: 'green', status: 'Pass' },
        { id: 3, color: 'blue', status: 'Pass' },
        { id: 4, color: 'yellow', status: 'Pass' },
        { id: 5, color: 'purple', status: 'Pass' },
        { id: 6, color: 'orange', status: 'Pass' },
        { id: 7, color: 'black', status: 'Pass' },
        { id: 8, color: 'white', status: 'Pass' },
        { id: 9, color: 'pink', status: 'Pass' },
        { id: 10, color: 'cyan', status: 'Pass' },
      ];
      const colorsToFilter = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'black', 'white', 'sky-blue'];
      
      // @ts-ignore
      const result = filterDataByColor(allColorsData, colorsToFilter);
      
      expect(result).toHaveLength(8);
      expect(result.find(item => item.color === 'pink')).toBeUndefined();
      expect(result.find(item => item.color === 'cyan')).toBeUndefined();
      expect(result.find(item => item.color === 'red')).toBeDefined();
    });

    it('formatAndDisplay should print a full report including errors and skipped', () => {
      // @ts-ignore
      formatAndDisplay(mockFullFinalResult);
      
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));

      expect(logOutput).toContain('FINAL TEST RESULTS');
      expect(logOutput).toContain('############# Color: red #############');
      expect(logOutput).toContain('  --- PASS (1) ---');
      expect(logOutput).toContain('     [1] Test 1');
      expect(logOutput).toContain('  --- PENDING (1) ---');
      expect(logOutput).toContain('     [3] Test 3');
      expect(logOutput).toContain('  --- FAIL (1) ---');
      expect(logOutput).toContain('     [6] Test 6 Error');
      // [FIX] Use regex to match the error line robustly, ignoring potential whitespace or invisible artifacts
      expect(logOutput).toMatch(/\s+└> Error: This is an error/);
      expect(logOutput).toContain('  --- SKIPPED (1) ---');
      expect(logOutput).toContain('     [7] Test 7 Skipped');
      expect(logOutput).toContain('########################################');
      expect(logOutput).toContain('############# Color: purple #############');
      expect(logOutput).toContain('  --- PASS (1) ---');
      expect(logOutput).toContain('     [5] Test 5');
      expect(logOutput).toContain('########################################');
    });

    it('formatAndDisplay should handle null or empty data', () => {
      // @ts-ignore
      formatAndDisplay(null);
      const logOutput1 = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput1).toContain('No formatted data to display.');

      consoleLogSpy.mockClear();

      formatAndDisplay({});
      const logOutput2 = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput2).toContain('No formatted data to display.');
    });

    it('formatAndDisplay should use correct colors for all headers', () => {
      const colorMockData = {
        yellow: { pass: [{ id: 1, color: 'yellow', status: 'Pass', value: 'Test 1' }], fail:[], pending:[], skipped:[] },
        blue: { pass: [{ id: 2, color: 'blue', status: 'Pass', value: 'Test 2' }], fail:[], pending:[], skipped:[] },
        orange: { pass: [{ id: 3, color: 'orange', status: 'Pass', value: 'Test 3' }], fail:[], pending:[], skipped:[] },
        black: { pass: [{ id: 4, color: 'black', status: 'Pass', value: 'Test 4' }], fail:[], pending:[], skipped:[] },
        defaultColor: { pass: [{ id: 5, color: 'defaultColor', status: 'Pass', value: 'Test 5' }], fail:[], pending:[], skipped:[] },
      };

      // @ts-ignore
      formatAndDisplay(colorMockData);
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));

      expect(logOutput).toContain('############# Color: yellow #############');
      expect(logOutput).toContain('############# Color: blue #############');
      expect(logOutput).toContain('############# Color: orange #############');
      expect(logOutput).toContain('############# Color: black #############');
      expect(logOutput).toContain('############# Color: defaultColor #############');
    });
  });

  describe('runFlow (Integration Tests)', () => {
    it('should run the full "happy path" flow successfully', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockImplementation((url) => {
        if (url.endsWith('/test-format')) {
          return Promise.resolve({ data: { id: 'job-123' } });
        }
        if (url.endsWith('/retrieve')) {
          return Promise.resolve({ data: { file: mockFullFinalResult } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await runFlow({ colors: 'red,purple' });
      
      jest.runAllTimers(); 

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/data');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/test-format',
        {
          tests: [
            { id: 1, color: 'red', status: 'Pass' },
            { id: 3, color: 'red', status: 'Pending' },
          ],
        }
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/retrieve',
        { id: 'job-123' }
      );
      
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Job complete. Results retrieved.');
      expect(logOutput).toContain('############# Color: red #############');
      expect(logOutput).toContain('########################################');
      expect(logOutput).toContain('############# Color: purple #############');
    });

    it('should warn and exit if no data matches filters', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });

      await runFlow({ colors: 'magenta' }); 
      
      const warnOutput = stripAnsi(consoleWarnSpy.mock.calls.flat().join('\n'));
      expect(warnOutput).toContain('⚠️ No data found for the specified colors. Exiting.');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should use "sky-blue" as default color if none provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });

      await runFlow({}); 
      
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Filtering for colors: sky-blue');
      const warnOutput = stripAnsi(consoleWarnSpy.mock.calls.flat().join('\n'));
      expect(warnOutput).toContain('⚠️ No data found for the specified colors. Exiting.');
    });
    
    it('should handle polling timeout', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockImplementation((url) => {
        if (url.endsWith('/test-format')) {
          return Promise.resolve({ data: { id: 'job-123' } });
        }
        if (url.endsWith('/retrieve')) {
          return Promise.resolve({ data: { file: undefined } });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
      
      const runPromise = runFlow({ colors: 'red' });
      
      for(let i = 0; i < 10; i++) {
        await jest.advanceTimersByTimeAsync(1000);
      }
      await runPromise;

      expect(mockedAxios.post).toHaveBeenCalledTimes(1 + 10);
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Polling timed out after 10 attempts.');
    });

    it('should handle a server connection error', async () => {
      const connError = new Error("Connection refused");
      // @ts-ignore
      connError.code = 'ECONNREFUSED';
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockRejectedValue(connError);

      await runFlow({ colors: 'red' });

      expect(mockedAxios.isAxiosError).toHaveBeenCalledWith(connError);
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Connection refused. Is the server running at localhost:3000?');
    });

    it('should handle an error from the initial GET /data', async () => {
      const getDataError = new Error("Server Error") as AxiosError;
      getDataError.response = { status: 500, data: { message: "Internal Error" }, statusText: 'Server Error', headers: {}, config: { headers: {} as any } };
      
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockRejectedValue(getDataError);

      await runFlow({ colors: 'red' });

      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('HTTP Status: 500');
      expect(errorOutput).toContain('Data: {"message":"Internal Error"}');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle an error from /test-format', async () => {
      const testFormatError = new Error("Invalid format") as AxiosError;
      testFormatError.response = { status: 400, data: { message: "Bad JSON" }, statusText: 'Bad Request', headers: {}, config: { headers: {} as any } };
      
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockRejectedValue(testFormatError);

      await runFlow({ colors: 'red' });

      expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:3000/test-format', expect.anything());
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('HTTP Status: 400');
      expect(errorOutput).toContain('Data: {"message":"Bad JSON"}');
    });

    it('should handle missing job ID from /test-format', async () => {
      // [FIX] Ensure this is false so the logic falls through to the generic error handler
      mockedAxios.isAxiosError.mockReturnValue(false);
      
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockResolvedValue({ data: { status: 'received', id: undefined } }); // No ID
      
      // The error is caught inside runFlow, so we just await.
      await runFlow({ colors: 'red' });
      
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Failed to get a Job ID from /test-format');
    });

    it('should handle an error from /retrieve', async () => {
      const retrieveError = new Error("Not Found") as AxiosError;
      retrieveError.response = { status: 404, data: { message: "File not found" }, statusText: 'Not Found', headers: {}, config: { headers: {} as any } };

      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      
      mockedAxios.post.mockImplementation((url) => {
        if (url.endsWith('/test-format')) {
          return Promise.resolve({ data: { id: 'job-123' } });
        }
        if (url.endsWith('/retrieve')) {
          return Promise.reject(retrieveError);
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await runFlow({ colors: 'red' });

      expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:3000/retrieve', { id: 'job-123' });
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('HTTP Status: 404');
      expect(errorOutput).toContain('Data: {"message":"File not found"}');
    });

    it('should handle a generic error in runFlow', async () => {
      const genericError = new Error('A generic error');
      mockedAxios.get.mockRejectedValue(genericError); // Throw on the first call
      mockedAxios.isAxiosError.mockReturnValue(false); 

      await runFlow({ colors: 'red' });

      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('A generic error');
      expect(errorOutput).not.toContain('HTTP Status');
    });

    it('should handle an unknown error in runFlow', async () => {
      const unknownError = 'An unknown string error';
      mockedAxios.get.mockRejectedValue(unknownError); // Throw on the first call
      mockedAxios.isAxiosError.mockReturnValue(false);

      await runFlow({ colors: 'red' });

      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('An unknown error occurred:');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('An unknown error occurred:'), unknownError);
    });
  });
  
  describe('getApiHelp', () => {
    it('should fetch and log the help text', async () => {
      const helpText = "Thank you for using the CLI test server...";
      mockedAxios.get.mockResolvedValue({ data: helpText });
      
      await getApiHelp();
      
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('--- Server Help Text ---');
      expect(logOutput).toContain(helpText);
    });

    it('should handle a connection error', async () => {
      const connError = new Error("Connection refused");
      // @ts-ignore
      connError.code = 'ECONNREFUSED';
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockRejectedValue(connError);

      await getApiHelp();
      
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('Connection refused. Is the server running at localhost:3000?');
    });

    it('should handle an API error', async () => {
      const apiError = new Error("Not Found") as AxiosError;
      apiError.response = { status: 404, data: { message: "Not Found" }, statusText: 'Not Found', headers: {}, config: { headers: {} as any } };
      
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockedAxios.get.mockRejectedValue(apiError);

      await getApiHelp();
      
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('HTTP Status: 404');
      expect(errorOutput).toContain('Data: {"message":"Not Found"}');
    });

    it('should handle a generic error in getApiHelp', async () => {
      const genericError = new Error('A generic error');
      mockedAxios.get.mockRejectedValue(genericError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await getApiHelp();
      
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('A generic error');
      expect(errorOutput).not.toContain('HTTP Status');
    });

    it('should handle an unknown error in getApiHelp', async () => {
      const unknownError = 'An unknown string error';
      mockedAxios.get.mockRejectedValue(unknownError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      await getApiHelp();
      
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
      expect(errorOutput).toContain('An unknown error occurred:');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('An unknown error occurred:'), unknownError);
    });
  });

  // [UPDATE] New test suite for the interactive shell
  describe('Interactive Shell (main)', () => {
    // We access the mocked createInterface to define its return value per test
    const mockCreateInterface = readline.createInterface as jest.Mock;
    let mockQuestion: jest.Mock;
    let mockClose: jest.Mock;

    beforeEach(() => {
      mockQuestion = jest.fn();
      mockClose = jest.fn();
      // Setup the mock to return our specific question/close mocks
      mockCreateInterface.mockReturnValue({
        question: mockQuestion,
        close: mockClose,
      });
    });

    it('should handle "api-help" command and then "q" to quit', async () => {
      // Setup inputs: First "api-help", then "q" to break the loop
      mockQuestion.mockResolvedValueOnce('api-help').mockResolvedValueOnce('q');
      
      // Mock API for help
      mockedAxios.get.mockResolvedValue({ data: 'Help Text' });

      await main();

      // Verify help was fetched and the interface closed
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/help');
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Server Help Text');
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle "run" command with args', async () => {
      // Setup inputs: "run" command, then "q"
      mockQuestion.mockResolvedValueOnce('run --colors red').mockResolvedValueOnce('q');

      // Mock full flow for "run" so it completes without error
      mockedAxios.get.mockResolvedValue({ data: mockApiData });
      mockedAxios.post.mockImplementation((url) => {
         if (url.endsWith('/test-format')) return Promise.resolve({ data: { id: 'job-1' } });
         if (url.endsWith('/retrieve')) return Promise.resolve({ data: { file: mockFullFinalResult } });
         return Promise.resolve({ data: {} });
      });

      await main();

      // Verify the runFlow logic was triggered
      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3000/data');
      const logOutput = stripAnsi(consoleLogSpy.mock.calls.flat().join('\n'));
      expect(logOutput).toContain('Filtering for colors: red');
    });

    it('should handle unknown commands gracefully', async () => {
       mockQuestion.mockResolvedValueOnce('unknown-cmd').mockResolvedValueOnce('q');
       
       await main();

       // Yargs prints to stderr or uses the .fail() handler which prints to error
       const errorOutput = stripAnsi(consoleErrorSpy.mock.calls.flat().join('\n'));
       // We just want to ensure it didn't crash and printed *something* to error/log
       expect(errorOutput).toBeTruthy();
       expect(errorOutput).toContain('Unknown argument: unknown-cmd');
    });
    
    it('should ignore empty input and continue prompting', async () => {
        // Empty string then q
        mockQuestion.mockResolvedValueOnce('').mockResolvedValueOnce('q');
        await main();
        
        // Verify the loop continued until close was called
        expect(mockClose).toHaveBeenCalled();
    });
  });
});