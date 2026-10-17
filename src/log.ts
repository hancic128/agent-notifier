type Level = "debug" | "info" | "warn" | "error";

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

function emit(level: Level, msg: string): void {
  if (!verbose && level === "debug") return;
  const tag =
    level === "debug" ? "[debug]" : level === "info" ? "" : level === "warn" ? "[warn] " : "[error]";
  const stream = level === "error" || level === "warn" ? process.stderr : process.stderr;
  stream.write(`${tag}${msg}\n`);
}

export const log = {
  debug: (m: string): void => emit("debug", m),
  info: (m: string): void => emit("info", m),
  warn: (m: string): void => emit("warn", m),
  error: (m: string): void => emit("error", m),
};