// Checks for the hand-rolled CSV reader in src/lib/csv.ts.
//
// The parser is the one piece of the bulk upload that cannot be eyeballed:
// quoting rules are small, but every one of them has a failure mode that looks
// like valid data rather than an error — a row split in two, a file that
// reports half its rows, an error pointing at the wrong line. So each rule has
// a case, including the ones whose only visible effect is the line number in an
// error message.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLoader } = require('./load-ts.cjs');

const { parseCsv, parseCsvRows, CsvError, toCsv } = createLoader()('src/lib/csv.ts');

test('reads the shape of a file', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  // Excel writes a BOM; left in place the first header never matches.
  assert.deepEqual(parseCsv('﻿name,x\nv,1'), [['name', 'x'], ['v', '1']]);
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']]);
  assert.deepEqual(parseCsv(''), []);
});

test('honours quoting', () => {
  assert.deepEqual(parseCsv('a,b\n"Ring, 22K",2'), [['a', 'b'], ['Ring, 22K', '2']]);
  assert.deepEqual(parseCsv('a\n"He said ""hi"""'), [['a'], ['He said "hi"']]);
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",2'), [['a', 'b'], ['line1\nline2', '2']]);
  assert.deepEqual(parseCsv('a\n"l1\r\nl2"'), [['a'], ['l1\r\nl2']]);
  assert.deepEqual(parseCsv('a,b\n"",2'), [['a', 'b'], ['', '2']]);
  assert.deepEqual(parseCsv('a\n12"x'), [['a'], ['12"x']]);
});

test('returns values untouched', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]);
  assert.deepEqual(parseCsv('a,b\n1,'), [['a', 'b'], ['1', '']]);
  assert.deepEqual(parseCsv('a,b\n 1 , 2 '), [['a', 'b'], [' 1 ', ' 2 ']]);
  // Ragged rows are the caller's problem to report, with the row number.
  assert.deepEqual(parseCsv('a,b,c\n1,2'), [['a', 'b', 'c'], ['1', '2']]);
});

test('drops blank lines', () => {
  assert.deepEqual(parseCsv('a,b\n\n1,2\n\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\n   \n1,2'), [['a', 'b'], ['1', '2']]);
});

test('reports an unterminated quote at the line it opened on', () => {
  const lineOf = (input) => {
    try {
      parseCsv(input);
      return 'no throw';
    } catch (err) {
      return err instanceof CsvError ? err.line : 'wrong error type';
    }
  };
  // Accepting this would swallow the rest of the file into one field, which
  // reads downstream as "the file only had N rows".
  assert.equal(lineOf('a,b\n"unclosed,2'), 2);
  // The line must be the one the person counts in their spreadsheet. Getting
  // CRLF wrong here doubles the count without changing any parsed row.
  assert.equal(lineOf('a,b\n1,2\n"oops,3'), 3);
  assert.equal(lineOf('a,b\r\n1,2\r\n"oops,3'), 3);
  assert.equal(lineOf('a,b\n"x\ny",2\n"oops,3'), 4);
});

test('tags each record with the line it started on', () => {
  // A record's index is not its line: blank lines are dropped and a quoted
  // value may span several. The tag is what an error message quotes back.
  const lines = (input) => parseCsvRows(input).map((r) => r.line);
  assert.deepEqual(lines('a,b\n1,2\n3,4'), [1, 2, 3]);
  assert.deepEqual(lines('a,b\r\n1,2\r\n3,4'), [1, 2, 3]);
  assert.deepEqual(lines('a,b\n\n\n1,2'), [1, 4]);
  assert.deepEqual(lines('a,b\n"x\ny",2\n3,4'), [1, 2, 4]);
  assert.deepEqual(lines('\na,b\n1,2'), [2, 3]);
  assert.deepEqual(parseCsvRows('a,b\n1,2')[1].values, ['1', '2']);
});

test('writes what needs quoting and nothing else', () => {
  assert.equal(toCsv(['a', 'b'], [['x', 'y']]), 'a,b\r\nx,y');
  const roundTrip = toCsv(['a', 'b'], [['Ring, 22K', 'say "hi"'], ['l1\nl2', '']]);
  assert.deepEqual(parseCsv(roundTrip), [['a', 'b'], ['Ring, 22K', 'say "hi"'], ['l1\nl2', '']]);
});
