import type { Express } from 'express';
import {
  deterministicPackageId,
  parkDesignPackageToCsv,
  PARK_DESIGN_PACKAGE_SCHEMA_VERSION,
  serializeParkDesignPackage,
  slug,
  validateParkDesignPackage,
  type ParkDesignPackage
} from '../lib/designPackage/contract.js';
import { ParkDesignPackageRepository } from '../lib/designPackage/repository.js';

export const designPackageRepository = new ParkDesignPackageRepository();

function normalizeIncomingPackage(body: unknown): ParkDesignPackage {
  const incoming = ((body as any)?.package ?? body) as Partial<ParkDesignPackage>;
  const projectName = incoming?.project?.name || (incoming?.project as any)?.site_name || 'Untitled park';
  const projectId = incoming?.project?.id || slug(projectName);
  const version = incoming?.version || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const generatedAt = incoming?.generated_at || new Date().toISOString();
  const normalized = {
    ...incoming,
    schema_version: incoming?.schema_version || PARK_DESIGN_PACKAGE_SCHEMA_VERSION,
    version,
    project: { total_site_area_m2: null, ...incoming?.project, id: projectId, name: projectName },
    site: { crs: '', units: '', north: 'up', area_m2: null, boundary: null, road_edge_roles: [], registered_objects: {}, ...incoming?.site },
    personas: incoming?.personas ?? [],
    program: incoming?.program ?? [],
    relationships: incoming?.relationships ?? [],
    journeys: incoming?.journeys ?? [],
    movement_demands: incoming?.movement_demands ?? [],
    site_fields: incoming?.site_fields ?? {},
    design_objectives: incoming?.design_objectives ?? {},
    constraints: incoming?.constraints ?? {},
    planting_requirements: incoming?.planting_requirements ?? [],
    dune_typologies: incoming?.dune_typologies ?? [],
    evidence: incoming?.evidence ?? {},
    provenance: incoming?.provenance ?? {},
    generation: incoming?.generation ?? { seed: null, settings: {} },
    generated_at: generatedAt
  } as ParkDesignPackage;
  normalized.package_id = incoming?.package_id || deterministicPackageId(projectId, version, { ...normalized, package_id: undefined, generated_at: undefined });
  return normalized;
}

function findPackage(value: string): ParkDesignPackage | null {
  return designPackageRepository.get(decodeURIComponent(value));
}

export function registerDesignPackageApi(app: Express): void {
  app.post('/api/design-package/generate', (req, res) => {
    const pkg = normalizeIncomingPackage(req.body);
    const validation = validateParkDesignPackage(pkg);
    if (!validation.valid && req.body?.allow_invalid !== true) return res.status(422).json(validation);
    designPackageRepository.save(pkg);
    return res.status(201).json({ package: pkg, validation });
  });

  app.post('/api/design-package/validate', (req, res) => {
    const pkg = normalizeIncomingPackage(req.body);
    return res.json(validateParkDesignPackage(pkg));
  });

  app.get('/api/design-package', (_req, res) => {
    const pkg = designPackageRepository.latest();
    return pkg ? res.json(pkg) : res.status(404).json({ error: 'No design package has been generated in this server instance.' });
  });

  app.get('/api/design-package/:id/validate', (req, res) => {
    const pkg = findPackage(req.params.id);
    return pkg ? res.json(validateParkDesignPackage(pkg)) : res.status(404).json({ error: 'Design package not found.' });
  });

  app.get('/api/design-package/:id/export', (req, res) => {
    const pkg = findPackage(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Design package not found.' });
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'program.csv' || format === 'relationships.csv') {
      const section = format.startsWith('program') ? 'program' : 'relationships';
      res.type('text/csv').setHeader('Content-Disposition', `attachment; filename="${pkg.package_id}-${section}.csv"`);
      return res.send(parkDesignPackageToCsv(pkg, section));
    }
    res.type('application/json').setHeader('Content-Disposition', `attachment; filename="${pkg.package_id}.json"`);
    return res.send(serializeParkDesignPackage(pkg));
  });

  app.get('/api/design-package/:id', (req, res) => {
    const pkg = findPackage(req.params.id);
    return pkg ? res.json(pkg) : res.status(404).json({ error: 'Design package not found.' });
  });
}
