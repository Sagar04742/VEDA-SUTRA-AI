// Minimal Server-Sent Events helper.
export function openSse(res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop nginx-style proxies from buffering the stream
  });
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });
  // Comment lines keep idle connections alive through proxies.
  const heartbeat = setInterval(() => !closed && res.write(': ping\n\n'), 15000);

  return {
    send(event, data) {
      if (closed || res.writableEnded) return false;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    end() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
    get closed() {
      return closed;
    },
  };
}
