Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch() {
    return new Response("hello world");
  },
});
