import test from "node:test";
import assert from "node:assert/strict";
import { tokenizePromptWeights } from "../src/lib/prompt-weights.mjs";

const content = (value, text) =>
  tokenizePromptWeights(value).find((s) => s.text === text);

test("numeric weight groups use blue weakening, amber strengthening and green boundaries", () => {
  const source = "plain, 0.2::artist:misaka::, 1.3::night sky::, rest";
  assert.equal(content(source, "artist:misaka").tone, "weak");
  assert.equal(content(source, "night sky").tone, "strong");
  assert.equal(content(source, ", rest").tone, "normal");
  const delimiters = tokenizePromptWeights(source).filter(
    (s) => s.kind === "delimiter",
  );
  assert.equal(delimiters.length, 4);
  assert.ok(delimiters.every((s) => s.text === "::"));
});

test("signed and decimal emphasis includes zero and negative weights", () => {
  for (const [prefix, weight] of [
    ["-2.5", -2.5],
    ["+1.2", 1.2],
    [".7", 0.7],
    ["0", 0],
    ["1.", 1],
  ]) {
    assert.equal(content(`${prefix}::内容::`, "内容").weight, weight);
  }
  assert.equal(content("1::neutral::", "neutral").tone, "normal");
  assert.equal(content("-1::monochrome::", "monochrome").tone, "weak");
});

test("nested brackets multiply emphasis and reset to neutral at a bare double colon", () => {
  const source = "{{强调}} plain [[弱化]] end {{{reset:: normal";
  assert.ok(Math.abs(content(source, "强调").weight - 1.1025) < 1e-10);
  assert.ok(Math.abs(content(source, "弱化").weight - 1 / 1.1025) < 1e-10);
  assert.equal(content(source, " plain ").tone, "normal");
  assert.equal(content(source, " normal").weight, 1);
});

test("unclosed groups apply to following text, including unmatched bracket controls", () => {
  assert.equal(
    content("1.3::open\nsecond line", "open\nsecond line").weight,
    1.3,
  );
  assert.equal(content("{open", "open").tone, "strong");
  assert.equal(content("]open", "open").tone, "strong");
  assert.equal(content("}open", "open").tone, "weak");
  assert.equal(content("[open", "open").tone, "weak");
});

test("explicit numeric groups reset previous emphasis and support bracket modifiers", () => {
  const source = "2::{bright} 0.5::soft::plain";
  assert.ok(Math.abs(content(source, "bright").weight - 2.1) < 1e-10);
  assert.equal(content(source, "soft").weight, 0.5);
  assert.equal(content(source, "plain").weight, 1);
});

test("single literal colons, artist tags and ordinary text remain neutral", () => {
  const source = "artist:名, https://example.com:123, 12:30, -1.5 weight";
  const segments = tokenizePromptWeights(source);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, source);
  assert.equal(segments[0].tone, "normal");
});

test("tokenization preserves exact Unicode, whitespace, HTML-like text and UTF-16 ranges", () => {
  for (const source of [
    "",
    "\r\n\t",
    "0.7::👩🏽‍🚀 月光\n\n猫\t<svg onload=alert(1)>::\n",
    "1.2::e\u0301::",
    "{{a [b]}::x",
    "...:::1:::bad",
  ]) {
    const segments = tokenizePromptWeights(source);
    assert.equal(segments.map((s) => s.text).join(""), source);
    let cursor = 0;
    for (const segment of segments) {
      assert.equal(segment.start, cursor);
      assert.equal(segment.text, source.slice(segment.start, segment.end));
      cursor = segment.end;
    }
    assert.equal(cursor, source.length);
  }
});

test("separate editor calls do not share parser state", () => {
  tokenizePromptWeights("5::{open");
  assert.equal(content("plain", "plain").weight, 1);
  assert.deepEqual(tokenizePromptWeights(), []);
});
