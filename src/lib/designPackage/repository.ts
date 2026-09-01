import type { ParkDesignPackage } from './contract.js';

/** Process-local repository used by the Express/Vercel adapter. A durable project repository can
 * implement this same surface later without changing the HTTP contract. */
export class ParkDesignPackageRepository {
  private readonly byId = new Map<string, ParkDesignPackage>();
  private readonly order: string[] = [];

  save(pkg: ParkDesignPackage): ParkDesignPackage {
    if (!this.byId.has(pkg.package_id)) this.order.push(pkg.package_id);
    this.byId.set(pkg.package_id, structuredClone(pkg));
    return structuredClone(pkg);
  }

  latest(): ParkDesignPackage | null {
    const id = this.order.at(-1);
    return id ? structuredClone(this.byId.get(id)!) : null;
  }

  get(idOrVersion: string): ParkDesignPackage | null {
    const exact = this.byId.get(idOrVersion);
    if (exact) return structuredClone(exact);
    for (let index = this.order.length - 1; index >= 0; index--) {
      const pkg = this.byId.get(this.order[index])!;
      if (pkg.version === idOrVersion) return structuredClone(pkg);
    }
    return null;
  }

  clear(): void {
    this.byId.clear();
    this.order.length = 0;
  }
}
