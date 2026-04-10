import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface User {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

class UserService {
  private users: User[] = [];
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, "users.json");
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      const data = readFileSync(this.filePath, "utf-8");
      this.users = JSON.parse(data);
    }
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.users, null, 2));
  }

  findById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }

  create(name: string, email: string): User {
    const newUser: User = {
      id: this.users.length + 1,
      name,
      email,
      createdAt: new Date().toISOString(),
    };
    this.users.push(newUser);
    this.save();
    return newUser;
  }

  delete(id: number): boolean {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    this.save();
    return true;
  }

  list(): User[] {
    return [...this.users];
  }
}

export default UserService;
