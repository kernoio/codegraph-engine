import { Elysia, t } from "elysia";

export const note = new Elysia({ prefix: "/note" })
  .decorate("note", { data: [] as string[] })
  .get("/", ({ note }) => note.data)
  .put("/", ({ note, body: { data } }) => note.data.push(data), {
    body: t.Object({ data: t.String() }),
  })
  .get("/:index", ({ note, params: { index } }) => note.data[index])
  .delete("/:index", ({ note, params: { index } }) => note.data.splice(index, 1))
  .patch("/:index", ({ note, params: { index }, body: { data } }) => {
    note.data[index] = data;
  }, { body: t.Object({ data: t.String() }) });
