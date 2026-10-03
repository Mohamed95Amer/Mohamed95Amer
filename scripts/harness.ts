/**
 * The smallest thing that can be called a test runner.
 *
 * The app has no test framework and this change did not seem like the moment
 * to choose one; what it does need is for the CSV importer's rules to be
 * checked by something other than reading them. Comparing JSON is enough for
 * pure functions over plain data, which is all these checks cover.
 */
let pass = 0;
let fail = 0;

export function eq(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log("  FAIL " + name + "\n       got  " + g + "\n       want " + w);
  }
}

export function section(title: string): void {
  console.log("\n" + title);
}

/** Prints the tally and sets a non-zero exit code if anything failed. */
export function report(): void {
  console.log("\n" + pass + " passed, " + fail + " failed");
  if (fail > 0) process.exitCode = 1;
}
