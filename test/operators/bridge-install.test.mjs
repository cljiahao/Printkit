import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const installer = fs.readFileSync(
  new URL("../../bridge-agent/install.sh", import.meta.url),
  "utf8",
);
const marker = 'sudo -u "$SERVICE_USER" sh -c ';
const start = installer.indexOf(marker) + marker.length;
const end = installer.indexOf('\' sh "$SOURCE_DIR"', start + 1);
const body = installer.slice(start + 1, end);
const shell =
  process.platform === "win32"
    ? "C:\\Program Files\\Git\\bin\\bash.exe"
    : "/bin/sh";
for (const fail of [false, true])
  test(
    fail
      ? "installer stops at a failed locked install"
      : "installer handles apostrophes in its source path without command injection",
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "printkit' operator-"));
      const capture = path.join(dir, "commands.log");
      fs.writeFileSync(
        path.join(dir, "npm"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AUDIT_CAPTURE"\nif [ "$AUDIT_FAIL_CI" = "yes" ] && [ "$1" = "ci" ]; then exit 7; fi\n',
        { mode: 0o755 },
      );
      const asPosix = (value) => value.replaceAll("\\", "/");
      const result = spawnSync(shell, ["-c", body, "sh", asPosix(dir)], {
        env: {
          PATH: asPosix(dir) + ":/usr/bin:/bin",
          AUDIT_CAPTURE: asPosix(capture),
          AUDIT_FAIL_CI: fail ? "yes" : "no",
          SYSTEMROOT: process.env.SYSTEMROOT,
        },
        encoding: "utf8",
      });
      assert.equal(result.status, fail ? 7 : 0, result.stderr);
      const commands = fs.readFileSync(capture, "utf8").trim().split("\n");
      assert.equal(commands[0], "ci --ignore-scripts --no-audit --no-fund");
      assert.equal(commands.length, fail ? 1 : 4);
      if (!fail) {
        assert.equal(
          commands[1],
          "rebuild --foreground-scripts @serialport/bindings-cpp @stoprocent/bluetooth-hci-socket @stoprocent/noble usb",
        );
        assert.equal(
          commands[3],
          "prune --omit=dev --ignore-scripts --no-audit --no-fund",
        );
      }
    },
  );
