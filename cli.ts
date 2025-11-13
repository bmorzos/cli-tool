#!/usr/bin/env node

import axios, { AxiosError } from 'axios';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export const BASE_URL = 'http://localhost:3000';

// ANSI Color Codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m", // Will be used for 'purple'
  cyan: "\x1b[36m",
  magenta_bright: "\x1b[95m",
  dim: "\x1b[90m",
};

interface TestItem {
  id: number;
  value: string;
  color: string;
  date: string;
  description: string;
  status: 'Pass' | 'Fail' | 'Pending' | 'Skipped';
  errorDetails?: string;
}

interface FormattedResult {
  [color: string]: {
    pass: TestItem[];
    fail: TestItem[];
    pending: TestItem[];
    skipped: TestItem[];
  };
}

interface PostResponse {
  status: string;
  id: string;
}

interface RetrieveResponse {
  status: string;
  file?: FormattedResult;
}
// ******************************************************************************************


const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export function filterDataByColor(data: TestItem[], colors: string[]): TestItem[] {
  return data.filter(item => colors.includes(item.color));
}

function getHeaderColor(colorName: string): string {
  switch (colorName.toLowerCase()) {
    case 'red': return colors.red;
    case 'green': return colors.green;
    case 'yellow': return colors.yellow;
    case 'blue': return colors.blue;
    case 'purple': return colors.magenta_bright;
    case 'orange': return colors.yellow;
    default:
      return colors.cyan;
  }
}

export function formatAndDisplay(data: FormattedResult) {
  if (!data || Object.keys(data).length === 0) {
    console.log("\nNo formatted data to display.");
    return;
  }

  console.log(`\n${colors.yellow}========================================${colors.reset}`);
  console.log(`         ${colors.yellow}FINAL TEST RESULTS${colors.reset}`);
  console.log(`${colors.yellow}========================================${colors.reset}`);

  for (const color of Object.keys(data)) {
    const headerColor = getHeaderColor(color);
    console.log(`\n${headerColor}############# Color: ${color} #############${colors.reset}`);
    const statuses = data[color];

    for (const status of Object.keys(statuses)) {
      const key = status as keyof typeof statuses;
      const items = statuses[key];

      if (items.length > 0) {
        let statusColor = colors.reset;
        switch (status.toLowerCase()) {
          case 'pass': statusColor = colors.green; break;
          case 'fail': statusColor = colors.red; break;
          case 'pending': statusColor = colors.yellow; break;
          case 'skipped': statusColor = colors.dim; break;
        }
        
        console.log(`\n  ${statusColor}--- ${status.toUpperCase()} (${items.length}) ---${colors.reset}`);
        
        for (const item of items) {
          console.log(`     [${item.id}] ${item.value}`);
          if (item.errorDetails) {
            console.log(`       ${colors.red}└> Error:${colors.reset} ${(item.errorDetails as string).substring(0, 50)}...`);
          }
        }
      }
    }
    console.log(`\n${headerColor}########################################${colors.reset}`);
  }
}

export async function getApiHelp() {
  console.log('Fetching help from API server...');
  try {
    const response = await axios.get<string>(`${BASE_URL}/help`);
    console.log('\n--- Server Help Text ---');
    console.log(response.data);
    console.log('------------------------');
  } catch (error) {
    console.error(`\n${colors.red}--- ERROR ENCOUNTERED ---${colors.reset}`);
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`${colors.red}Connection refused. Is the server running at localhost:3000?${colors.reset}`);
      } else if (error.response) {
        console.error(`${colors.red}HTTP Status: ${error.response.status}${colors.reset}`);
        console.error(`${colors.red}Data: ${JSON.stringify(error.response.data)}${colors.reset}`);
      }
    } else if (error && typeof error === 'object' && 'message' in error) {
      // [FIX] This is a more robust check than 'instanceof Error'
      console.error(`${colors.red}${(error as Error).message}${colors.reset}`);
    } else {
      console.error(`${colors.red}An unknown error occurred:${colors.reset}`, error);
    }
  }
}

export async function runFlow(argv: { colors?: string }) {
  const colorsToFilter = (argv.colors || 'sky-blue').split(',').map(c => c.trim());

  console.log(`🚀 Starting CLI task...`);
  console.log(`Filtering for colors: ${colorsToFilter.join(', ')}\n`);

  try {
    console.log('Fetching all data from /data...');
    const dataResponse = await axios.get<{ data: TestItem[] }>(`${BASE_URL}/data`);
    const allData = dataResponse.data.data;

    const filteredData = filterDataByColor(allData, colorsToFilter);

    if (filteredData.length === 0) {
      console.warn(`${colors.yellow}⚠️ No data found for the specified colors. Exiting.${colors.reset}`);
      return;
    }
    console.log(`Found ${filteredData.length} items matching criteria...`);

    console.log('Posting filtered data to /test-format...');
    const postResponse = await axios.post<PostResponse>(`${BASE_URL}/test-format`, {
      tests: filteredData,
    });

    const jobId = postResponse.data.id;
    if (!jobId) {
      throw new Error('Failed to get a Job ID from /test-format');
    }
    console.log(`Data submitted. Job ID: ${jobId}`);

    console.log('Polling /retrieve for final data...');
    let jobResult: FormattedResult | undefined = undefined;
    let pollAttempts = 0;

    while (!jobResult) {
      pollAttempts++;
      if (pollAttempts > 10) {
        throw new Error('Polling timed out after 10 attempts.');
      }

      const pollResponse = await axios.post<RetrieveResponse>(`${BASE_URL}/retrieve`, { id: jobId });
      const fileContent = pollResponse.data.file;

      if (fileContent) {
        jobResult = fileContent;
        console.log(`${colors.green}Job complete. Results retrieved.${colors.reset}`);
      } else {
        console.log('Processing... waiting 1 second.');
        await sleep(1000); // Note: We will mock this in tests
      }
    }

    formatAndDisplay(jobResult);

  } catch (error) {
    console.error(`\n${colors.red}--- ERROR ENCOUNTERED ---${colors.reset}`);
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`${colors.red}Connection refused. Is the server running at localhost:3000?${colors.reset}`);
      } else if (error.response) {
        console.error(`${colors.red}HTTP Status: ${error.response.status}${colors.reset}`);
        console.error(`${colors.red}Data: ${JSON.stringify(error.response.data)}${colors.reset}`);
      }
    } else if (error && typeof error === 'object' && 'message' in error) {
      // [FIX] This is a more robust check than 'instanceof Error'
      console.error(`${colors.red}${(error as Error).message}${colors.reset}`);
    } else {
      console.error(`${colors.red}An unknown error occurred:${colors.reset}`, error);
    }
  }
}


export async function main() {
  // Set up the yargs parser ONCE.
  // Pass an empty array `[]` to yargs to prevent it
  // from automatically parsing process.argv.
  const parser = yargs([])
    .strict()
    .command(
      'run', 
      'Run the full data processing flow', 
      (yargs) => { 
        return yargs.option('colors', {
          alias: 'c',
          type: 'string',
          description: 'Comma-separated list of colors to filter by',
          default: 'sky-blue',
        });
      },
      (argv) => runFlow(argv) 
    )
    .command(
      'api-help', 
      'Get help text from the API server', 
      () => {}, 
      () => getApiHelp()
    )
    .demandCommand(1, 'You must provide a valid command. (e.g., "run" or "help")')
    .help() 
    .exitProcess(false) // Do not exit the process on completion.
    .fail((msg, err) => { // Custom fail handler to not exit the loop
      if (err) console.error(`${colors.red}${err.message}${colors.reset}`);
      else console.error(`${colors.red}${msg}${colors.reset}`);
    });

  if (process.argv.length > 2) {
    await parser.parse(process.argv.slice(2));
    return;
  }

  const rl = readline.createInterface({ input, output });
  console.log(`${colors.green}CLI Tool started. Type "run", "help", or "q" to quit.${colors.reset}\n`);

  async function recursivePrompt() {
    try {
      const line = await rl.question(`${colors.magenta}Onebrief CLI > ${colors.reset}`);

      if (line.trim().toLowerCase() === 'q') {
        rl.close();
        return; 
      }

      if (line.trim()) {
        // Parse the line. Yargs will find the command
        // and execute its handler (runFlow or getApiHelp).
        await parser.parse(line);
      }
    } catch (error) {
      console.error(`${colors.red}Error: ${(error as Error).message}${colors.reset}`);
    }
    recursivePrompt();
  }

  await recursivePrompt();
}

if (require.main === module) {
  main();
}