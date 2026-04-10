import { readFileSync } from "fs";

interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
}

interface ApiContext {
  db: Map<number, Post>;
  log: (msg: string) => void;
}

class PostRepository {
  constructor(private ctx: ApiContext) {}

  async findAll(): Promise<Post[]> {
    this.ctx.log("findAll");
    return Array.from(this.ctx.db.values());
  }

  async findById(id: number): Promise<Post | undefined> {
    this.ctx.log("findById " + id);
    return this.ctx.db.get(id);
  }

  async create(data: Omit<Post, "id">): Promise<Post> {
    const id = this.ctx.db.size + 1;
    const post: Post = { ...data, id };
    this.ctx.db.set(id, post);
    this.ctx.log("created " + id);
    return post;
  }

  async update(id: number, data: Partial<Post>): Promise<Post | null> {
    const existing = this.ctx.db.get(id);
    if (!existing) return null;
    const updated: Post = { ...existing, ...data };
    this.ctx.db.set(id, updated);
    return updated;
  }

  async delete(id: number): Promise<boolean> {
    return this.ctx.db.delete(id);
  }
}

export default PostRepository;
