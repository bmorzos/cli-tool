#!/usr/bin/env node

import axios from 'axios';
import yargs from 'yargs/yargs';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

// Configuration & Constants
export const BASE_URL = process.env.API_URL || 'http://localhost:3000';
export const MAX_POLL_ATTEMPTS = 10;
export const POLL_INTERVAL_MS = 2000;

// ANSI Color Codes for terminal output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  dim: "\x1b[90m",
  blueOnWhite: "\x1b[34m\x1b[47m",
  whiteOnBlue: "\x1b[47m\x1b[44m",
  blueOnBlue: "\x1b[34;44m",
};

export interface TestItem {
  id: number;
  value: string;
  color: string;
  status: 'Pass' | 'Fail' | 'Pending' | 'Skipped';
  errorDetails?: string;
}

export interface FormattedResult {
  [color: string]: {
    pass: TestItem[];
    fail: TestItem[];
    pending: TestItem[];
    skipped: TestItem[];
  };
}

const STATUS_COLOR_MAP: Record<string, string> = {
  pass: colors.green,
  fail: colors.red,
  pending: colors.yellow,
  skipped: colors.dim,
};

const HEADER_COLOR_MAP: Record<string, string> = {
  red: colors.red,
  green: colors.green,
  yellow: colors.yellow,
  blue: colors.blue,
  magenta: colors.magenta,
  cyan: colors.cyan,
  orange: colors.yellow,
  purple: colors.magenta,
};

let formattedLines: string[] = [];
const addLine = (text: string, color: string = colors.reset) => formattedLines.push(`${color}${text}${colors.reset}`);
const addSeparator = (char: string, color: string, count: number = 50) => addLine(char.repeat(count), color);

function displayBlockHeader(color: string = colors.blue) {
  formattedLines = [];
  addSeparator(' ', colors.blueOnBlue, 63);
  addLine(`  ██████  ███    ██ ███████ ██████  ██████  ██ ███████ ███████ `, color);
  addLine(` ██    ██ ████   ██ ██      ██   ██ ██   ██ ██ ██      ██      `, color);
  addLine(` ██    ██ ██ ██  ██ █████   ██████  ██████  ██ █████   █████   `, color);
  addLine(` ██    ██ ██  ██ ██ ██      ██   ██ ██   ██ ██ ██      ██      `, color);
  addLine(`  ██████  ██   ████ ███████ ██████  ██   ██ ██ ███████ ██      `, color);
  addSeparator(' ', colors.blueOnBlue, 63);
  console.log(formattedLines.join('\n'));
}

function displayASCIIReportHeader(color: string = colors.blue) {
  addSeparator(' ', color, 102);
  addLine(` █████ ▄▄ ▄▄  ▄▄  ▄▄▄  ▄▄      ██████ ▄▄▄▄▄  ▄▄▄▄ ▄▄▄▄▄▄   █████▄  ▄▄▄▄▄  ▄▄▄▄ ▄▄ ▄▄ ▄▄   ▄▄▄▄▄▄ ▄▄▄▄ `, color);
  addLine(` ██▄▄  ██ ███▄██ ██▀██ ██        ██   ██▄▄  ███▄▄   ██     ██▄▄██▄ ██▄▄  ███▄▄ ██ ██ ██     ██  ███▄▄ `, color);
  addLine(` ██    ██ ██ ▀██ ██▀██ ██▄▄▄     ██   ██▄▄▄ ▄▄██▀   ██     ██   ██ ██▄▄▄ ▄▄██▀ ▀███▀ ██▄▄▄  ██  ▄▄██▀ `, color);
  addSeparator(' ', color, 102);
}
                                                                                                                         
export function filterDataByColor(data: TestItem[], filterColors: string[]): TestItem[] {
  return data.filter(item => 
    filterColors.some(filter => item.color.toLowerCase() === filter.toLowerCase())
  );
}

export function formatResult(data: FormattedResult): string {
  if (!data || Object.keys(data).length === 0) {
    return `\n${colors.dim}No formatted data to display.${colors.reset}`;
  }

  for (const [colorName, statuses] of Object.entries(data)) {
    const headerKey = Object.keys(HEADER_COLOR_MAP).find(k => colorName.toLowerCase().includes(k));
    const headerColor = headerKey ? HEADER_COLOR_MAP[headerKey] : colors.cyan;

    addLine(`\n${headerColor}### Group: ${colorName} ###${colors.reset}`);

    (['pass', 'fail', 'pending', 'skipped'] as const).forEach((statusKey) => {
      const items = statuses[statusKey];
      if (items && items.length > 0) {
        const statusColor = STATUS_COLOR_MAP[statusKey] || colors.reset;
        addLine(`  ${statusColor}• ${statusKey.toUpperCase()} (${items.length})`);
        
        items.forEach(item => {
          addLine(`     [${item.id}] ${item.value}`);
          if (item.errorDetails) {
            const err = String(item.errorDetails).substring(0, 60);
            addLine(`       └> Error: ${err}...`, colors.red);
          }
        });
      }
    });
  }
  return formattedLines.join('\n');
}

// --- API INTERACTIONS ---

export function logError(error: unknown) {
  console.error(`\n${colors.red}--- ERROR ---${colors.reset}`);
  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 'Unknown';
    console.error(`Status: ${status}`);
    // Use logical OR to safely fallback if data is missing
    const msg = error.response?.data || error.message;
    console.error(`Message: ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
  } else {
    console.error(String(error));
  }
}

export async function generateFormattedReport(argv: { colors?: string }) {
  const colorsToFilter = (argv.colors || 'sky-blue').split(',').map(c => c.trim());
  console.log(`\nInitiating Report Process. Filter: [${colorsToFilter.join(', ')}]`);

  try {
    console.log(`${colors.dim}Fetching data...${colors.reset}`);
    const { data: apiData } = await axios.get(`${BASE_URL}/data`);
    const filtered = filterDataByColor(apiData.data, colorsToFilter);

    if (filtered.length === 0) {
      console.warn(`${colors.yellow}No items matched your color filter.${colors.reset}`);
      return;
    }
    console.log(`> Found ${filtered.length} items.`);

    console.log(`${colors.dim}Submitting for formatting...${colors.reset}`);
    const { data: job } = await axios.post(`${BASE_URL}/test-format`, { tests: filtered });
    
    if (!job.id) throw new Error("No Job ID returned!");
    console.log(`> Job ID: ${job.id}`);

    process.stdout.write('Polling ');
    let result: FormattedResult | undefined;
    
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      process.stdout.write('.');
      const { data: poll } = await axios.post(`${BASE_URL}/retrieve`, { id: job.id });
      if (poll.file) {
        result = poll.file;
        break;
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.log('\n');

    if (!result) throw new Error("Polling timed out.");
    formattedLines = [];
    displayASCIIReportHeader(colors.whiteOnBlue);
    const reportOutput = formatResult(result); 
    console.log(reportOutput);

  } catch (error) {
    logError(error);
  }
}

// --- MAIN EXECUTION ---

export async function main() {
  let shouldExitOnError = true;
  const parser = yargs(process.argv.slice(2))
    .scriptName('')
    .exitProcess(false)
    
    .usage(
      `${colors.whiteOnBlue}Onebrief QA CLI - Test Reporting and API Utility${colors.reset}\n` +
      `Usage: $0 <command> [options] or simply run $0 for interactive mode.`
    )
    .epilog(
      `${colors.dim}HINT: All connection errors are logged with status and a helpful message.${colors.reset}\n` +
      `${colors.dim}API Base URL: ${BASE_URL}${colors.reset}`
    )
    
    .command(
      'report', 
      'Generate a formatted test result report, filtered by color group.', 
      (y) => y.option('colors', { 
          alias: 'c', 
          type: 'string', 
          default: 'sky-blue',
          description: 'Comma-separated list of test color groups to include in the report.'
      }),
      (argv) => generateFormattedReport(argv)
    )
    .command(
      'api-info', 
      'Retrieve and display general help text from the configured server API.', 
      () => {}, 
      async () => {
        try {
            const res = await axios.get(`${BASE_URL}/help`);
            console.log(`\n${colors.green}Server API Information:${colors.reset}\n${res.data}`);
        } catch (e) { logError(e); }
      }
    )
    .command(
        'api-call <method> <endpoint>',
        'Execute a raw HTTP request against the server for debugging or utility use.', 
        (y) => y
            .positional('method', { choices: ['GET', 'POST', 'PATCH', 'DELETE'] as const, type: 'string', description: 'HTTP method to use' })
            .positional('endpoint', { type: 'string', description: 'The server path (e.g., /status or /data)' })
            .option('data', { alias: 'd', type: 'string', description: 'JSON payload (stringified) for POST/PATCH requests.' }),
        async (argv) => {
            try {
                const endpoint = argv.endpoint as string; 
                const url = `${BASE_URL}/${endpoint.replace(/^\//, '')}`;
                
                const data = argv.data ? JSON.parse(argv.data) : undefined;
                console.log(`${colors.yellow}Sending ${argv.method} to ${url}...${colors.reset}`);
                
                // Use the default export for the raw request
                const res = await axios({ method: argv.method, url, data });
                
                console.log(colors.green + `Status: ${res.status}` + colors.reset);
                console.dir(res.data, { depth: null, colors: true });
            } catch (e) { logError(e); }
        }
    )

    .example('$0 report -c green,yellow', 'Generate a report only for the "green" and "yellow" color groups.')
    .example(`$0 report -c "sky blue"`, 'Generate a report for color groups with spaces in their name (e.g., "sky blue").')
    .example('$0 api-info', 'Retrieve and print the server API documentation.')
    .example('$0 api-call GET data', 'Fetch and display the raw, unfiltered data set from the API.')
    .example('$0 api-call GET help', 'Quickly retrieve the server’s API usage documentation.')
    .example('$0 api-call POST job-status -d \'{"id": "job-123"}\'', 'Check the status of a specific processing job by ID.')
    .example('$0 api-call PATCH config -d \'{"timeout": 5000}\'', 'Send a configuration update to a specific endpoint.')
    
    .strict()
    .help()
    .fail((msg, err) => {
      // Yargs failure handler for robustness
      console.error(`\n${colors.red}--- CLI PARSING ERROR ---${colors.reset}`);
      if (err) logError(err);
      else console.error(`${colors.red}${msg}${colors.reset}`);
      console.error(`${colors.yellow}Use '--help' for a list of valid commands.${colors.reset}`);
      if (shouldExitOnError) {
         process.exit(1);
       }
    });

  if (process.argv.length > 2) {
    await parser.parse();
  } else {
    shouldExitOnError = false;
    const rl = readline.createInterface({ input, output });
    displayBlockHeader(colors.whiteOnBlue);
    console.log(`${colors.dim}Type "report -c red,blue" or "api-call GET status". Type "q" to exit.${colors.reset}`);

    while (true) {
      const line = await rl.question(`\n${colors.cyan}CLI> ${colors.reset}`);
      if (['q', 'quit', 'exit'].includes(line.trim().toLowerCase())) break;
      if (line.trim()) {
        //TODO Robust arg splitting that respects quotes would be better, but simple split works for now
        await parser.parse(line.trim().split(/\s+/));
      }
    }
    rl.close();
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main();
}