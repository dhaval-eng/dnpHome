// Shared test doubles for API route tests. No real DB or HTTP server
// involved — these are plain in-memory stand-ins for the Node (req, res)
// objects Vercel passes to a serverless function, and for the `sql` tagged-
// template client `@neondatabase/serverless` normally provides.

export function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headersSet: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end(data) {
      if (data !== undefined) this.body = data;
      return this;
    },
    setHeader(name, value) {
      this.headersSet[name] = value;
      return this;
    },
  };
}

// `rules` is a list of { match(sqlText) -> boolean, result } entries, checked
// in order. `result` can be an array of rows, or a function(values) -> rows
// for responses that depend on the bound parameters (e.g. a WHERE id = $1).
// Throws on an unmatched query so a test fails loudly instead of silently
// returning undefined.
export function createFakeSql(rules) {
  const calls = [];

  async function sql(strings, ...values) {
    const text = strings.join('?');
    calls.push({ text, values });

    for (const rule of rules) {
      if (rule.match(text)) {
        return typeof rule.result === 'function' ? rule.result(values) : rule.result;
      }
    }

    throw new Error(`No fake sql rule matched query: ${text}`);
  }

  sql.calls = calls;
  return sql;
}
