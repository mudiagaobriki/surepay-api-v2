export default {
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  
  // The test environment that will be used for testing
  testEnvironment: "node",
  
  // The glob patterns Jest uses to detect test files
  testMatch: [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ],
  
  // An array of regexp pattern strings that are matched against all test paths before executing the test
  testPathIgnorePatterns: [
    "/node_modules/"
  ],
  
  // An array of regexp pattern strings that are matched against all source file paths before re-running tests
  watchPathIgnorePatterns: [
    "/node_modules/"
  ],
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  
  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",
  
  // An array of regexp pattern strings that are matched against all file paths before executing the test
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/__tests__/"
  ],
  
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    "json",
    "text",
    "lcov",
    "clover"
  ],
  
  // A map from regular expressions to module names that allow to stub out resources
  // with a single module
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  
  // The maximum amount of workers used to run your tests
  maxWorkers: "50%",
  
  // An array of directory names to be searched recursively up from the requiring module's location
  moduleDirectories: [
    "node_modules",
    "src"
  ],
  
  // A preset that is used as a base for Jest's configuration
  // preset: undefined,
  
  // Run tests from one or more projects
  // projects: undefined,
  
  // Use this configuration option to add custom reporters to Jest
  // reporters: undefined,
  
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    "<rootDir>"
  ],
  
  // The path to a module that runs some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  
  // The test runner to use
  // testRunner: "jest-circus/runner",
  
  // Setting this value to "fake" allows the use of fake timers for functions
  timers: "fake",
  
  // A map from regular expressions to paths to transformers
  transform: {
    "^.+\\.js$": "babel-jest"
  },
  
  // An array of regexp pattern strings that are matched against all source file paths, matched files will skip transformation
  transformIgnorePatterns: [
    "/node_modules/",
    "\\.pnp\\.[^\\/]+$"
  ]
};