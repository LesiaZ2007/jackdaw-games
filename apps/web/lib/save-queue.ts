type Options = Record<string, unknown>;

/**
 * Sends option saves one at a time, oldest first. Each save is a full copy of the options, and
 * requests sent together can reach the server in any order, so an older copy landing last would
 * undo a newer change. While one save is in flight, later ones fold into a single follow-up that
 * carries the latest copy. Each `push` brings the sender to use. `done(n)` reports how many `push` calls a finished save covered.
 */
export function createSaveQueue(
  done: (covered: number) => void,
): (next: Options, send: (next: Options) => unknown) => void {
  let busy = false;
  let next: Options | null = null;
  let waiting = 0;
  let sender: (next: Options) => unknown = () => undefined;

  const drain = async () => {
    busy = true;
    while (next) {
      const body = next;
      const covers = waiting;
      next = null;
      waiting = 0;
      try {
        await Promise.resolve(sender(body));
      } catch {
        // The caller reports a failed save; the draft still has to settle.
      }
      done(covers);
    }
    busy = false;
  };

  return (o, send) => {
    next = o;
    sender = send;
    waiting += 1;
    if (!busy) void drain();
  };
}
