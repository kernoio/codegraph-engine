export interface Post {
  id: string
  title: string
}

const store: Post[] = []

export async function getPosts(): Promise<Post[]> {
  return store
}

export async function getPost(id: string): Promise<Post | undefined> {
  return store.find((p) => p.id === id)
}

export async function createPost(input: Omit<Post, 'id'>): Promise<Post> {
  const post = { id: String(store.length + 1), ...input }
  store.push(post)
  return post
}

export async function updatePost(id: string, input: Omit<Post, 'id'>): Promise<Post> {
  return { id, ...input }
}

export async function deletePost(id: string): Promise<boolean> {
  return store.some((p) => p.id === id)
}
