import fs from 'node:fs';
import path from 'node:path';
import {
  DUNE_TYPES, USER_GROUPS, buildParametricProgramDefinitions, buildParametricRelationships,
  buildUserProgramSuitability, programParametricFields, type ProgramOntologyInput
} from '../src/lib/gis/programOntology';

const packageDir = path.resolve('dataset/al_safa_2_park_design_package');
const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(packageDir, name), 'utf8')) as T;
const write = (name: string, data: unknown) => fs.writeFileSync(path.join(packageDir, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
const programFiles = ['area_programs.json', 'node_programs.json', 'route_programs.json'] as const;
const docs = programFiles.map(name => ({ name, doc: read<any>(name) }));
const rawPrograms = docs.flatMap(({ doc }) => doc.programs as any[]);
const relationships = read<any>('relationships.json');
relationships.schema_version = '1.3.0';

const adjacencyById = new Map<string, { preferred: string[]; avoid: string[]; service: string[]; movement: string[] }>();
for (const program of rawPrograms) adjacencyById.set(program.id, { preferred: [], avoid: [], service: [], movement: [] });
for (const edge of relationships.advisory_relationships ?? []) {
  const source = adjacencyById.get(edge.source);
  if (!source || !adjacencyById.has(edge.target)) continue;
  const bucket = edge.type === 'avoid' ? 'avoid' : edge.type === 'service' ? 'service' : edge.type === 'movement' ? 'movement' : 'preferred';
  source[bucket].push(edge.target);
}

const inputs: ProgramOntologyInput[] = rawPrograms.map(program => ({
  id: program.id,
  name: program.name,
  category: program.category,
  geometryType: program.geometry_type,
  scale: program.scale,
  primaryUsers: program.primary_users ?? ['All visitors'],
  minimumAreaM2: program.minimum_area_m2,
  targetAreaM2: program.target_area_m2,
  maximumAreaM2: program.maximum_area_m2,
  priority: program.priority,
  adjacency: adjacencyById.get(program.id)
}));

const definitions = buildParametricProgramDefinitions(inputs);
const definitionById = new Map(definitions.map(definition => [definition.id, definition]));
const suitability = buildUserProgramSuitability(definitions);
const computedRelationships = buildParametricRelationships(inputs, definitions);

for (const { name, doc } of docs) {
  doc.schema_version = '1.3.0';
  doc.programs = doc.programs.map((program: any) => ({ ...program, ...programParametricFields(definitionById.get(program.id)!) }));
  write(name, doc);
}

write('program_ontology.json', { schema_version: '1.3.0', dune_types: DUNE_TYPES, programs: definitions });
write('user_program_suitability.json', { schema_version: '1.3.0', user_groups: USER_GROUPS, suitability });
write('parametric_relationships.json', { schema_version: '1.3.0', scale: '-1_repulsion_to_1_attraction', authority: 'computed_advisory', relationships: computedRelationships });
write('relationships.json', relationships);

const manifest = read<any>('manifest.json');
manifest.schema_version = '1.3.0';
manifest.files.program_ontology = 'program_ontology.json';
manifest.files.user_program_suitability = 'user_program_suitability.json';
manifest.files.parametric_relationships = 'parametric_relationships.json';
manifest.counts.user_groups = USER_GROUPS.length;
manifest.counts.user_program_suitability = suitability.length;
manifest.counts.parametric_relationships = computedRelationships.length;
manifest.safety_policy.parametric_relationships = 'Computed scores are advisory evidence. Accepted designer and regulatory rules retain authority.';
write('manifest.json', manifest);

const readmePath = path.join(packageDir, 'README.txt');
let readme = fs.readFileSync(readmePath, 'utf8').replace('Package v1.2', 'Package v1.3');
if (!readme.includes('program_ontology.json')) readme += '\nprogram_ontology.json, user_program_suitability.json and parametric_relationships.json provide the computation-ready ontology and matrices; their computed scores are advisory.\n';
fs.writeFileSync(readmePath, readme, 'utf8');

console.log(JSON.stringify({ programs: definitions.length, userGroups: USER_GROUPS.length, suitability: suitability.length, relationships: computedRelationships.length }, null, 2));
