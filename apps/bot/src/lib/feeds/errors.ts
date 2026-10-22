/** a problem with a source someone typed, worded so it can be shown to them as-is */
export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}
