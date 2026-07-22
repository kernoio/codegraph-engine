export type Param = { title?: string; body?: string }
export async function getPosts(_db: unknown) { return [] }
export async function createPost(_db: unknown, _p: Param) { return { id: '1' } }
export async function getPost(_db: unknown, _id: string) { return null }
export async function updatePost(_db: unknown, _id: string, _p: Param) { return true }
export async function deletePost(_db: unknown, _id: string) { return true }
