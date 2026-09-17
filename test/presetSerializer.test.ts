import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAndValidatePresetJSON } from '../src/lib/preset/presetSerializer.ts';

describe('presetSerializer unit tests', () => {
  it('should parse valid preset correctly', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      name: 'テストプリセット',
      canvas: {
        aspectRatio: '16:9',
        fit: 'cover',
        positionOffset: { x: 10, y: -20 },
        backgroundColor: '#123456',
        transparent: true,
      },
      animation: {
        mode: 'linear_scan',
        duration: 2.5,
        startDelay: 0,
        holdTime: 0,
        mosaicSize: 32,
        feather: 0.2,
        easing: 'linear',
        loop: false,
        seed: 999,
        gridSize: 32,
        noiseStrength: 0.8,
        lodSteps: 6,
        lodSmooth: true,
        stagedReveal: true,
      },
      exportSettings: {
        resolutionPreset: '1080p',
        fps: 60,
        format: 'webm',
        gifPaletteMode: 'global',
      },
    });

    const result = parseAndValidatePresetJSON(json);
    assert.equal(result.name, 'テストプリセット');
    assert.equal(result.canvas.aspectRatio, '16:9');
    assert.equal(result.canvas.transparent, true);
    assert.equal(result.animation.mode, 'linear_scan');
    assert.equal(result.animation.startDelay, 0); // ゼロ値保持
    assert.equal(result.animation.holdTime, 0);   // ゼロ値保持
    assert.equal(result.animation.loop, false);
    assert.equal(result.animation.lodSmooth, true);
    assert.equal(result.animation.stagedReveal, true);
    assert.equal(result.exportSettings.fps, 60);
    assert.equal(result.exportSettings.format, 'webm');
  });

  it('should strictly parse boolean values and prevent "false" becoming true', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      canvas: {
        transparent: 'false', // 文字列 "false"
      },
      animation: {
        mode: 'radial_out',
        loop: 'false',
        lodSmooth: 'false',
        stagedReveal: 'false',
      },
    });

    const result = parseAndValidatePresetJSON(json);
    assert.equal(result.canvas.transparent, false, 'String "false" should parse to boolean false');
    assert.equal(result.animation.loop, false, 'String "false" should parse to boolean false');
    assert.equal(result.animation.lodSmooth, false, 'String "false" should parse to boolean false');
    assert.equal(result.animation.stagedReveal, false, 'String "false" should parse to boolean false');
  });

  it('should fallback invalid whitelisted values to safe defaults', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      canvas: {
        aspectRatio: 'invalid-ratio',
        fit: 'invalid-fit',
      },
      animation: {
        mode: 'invalid-mode',
        easing: 'invalid-easing',
      },
      exportSettings: {
        resolutionPreset: '4k',
        fps: 120, // 非対応FPS
        format: 'mkv', // 非対応形式
      },
    });

    const result = parseAndValidatePresetJSON(json);
    assert.equal(result.canvas.aspectRatio, '1:1');
    assert.equal(result.canvas.fit, 'contain');
    assert.equal(result.animation.mode, 'radial_out');
    assert.equal(result.animation.easing, 'cubic');
    assert.equal(result.exportSettings.resolutionPreset, '720p');
    assert.equal(result.exportSettings.fps, 30);
    assert.equal(result.exportSettings.format, 'mp4');
  });

  it('should reject invalid schema version and malformed json', () => {
    assert.throws(() => parseAndValidatePresetJSON('{ malformed }'));
    assert.throws(() => parseAndValidatePresetJSON(JSON.stringify({ schemaVersion: 2 })));
    assert.throws(() => parseAndValidatePresetJSON(JSON.stringify({ schemaVersion: 1 }))); // missing canvas & animation
  });
});
