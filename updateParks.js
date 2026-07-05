const fs = require('fs');
let content = fs.readFileSync('src/lib/googlePlaces.ts', 'utf8');

const toRemove = ['Safa Park', 'Mushrif Park', 'Quranic Park', 'Dubai Hills Park'];

// simple parse
const matchStart = content.indexOf('export const PRESEEDED_PARKS: ParkDetails[] = [');
const matchEnd = content.indexOf('];', matchStart) + 2;

let arrayText = content.substring(matchStart, matchEnd);

// we can use regex to remove objects inside array based on name property
toRemove.forEach(name => {
  const regex = new RegExp(`\\{\\s*placeId:[^}]*name:\\s*'${name}'[\\s\\S]*?\\}\\s*\\](?=\\s*,|\\s*\\])`, 'g');
  // Actually this is complex. Let's just use JSON parsing?
  // No it's TS code.
});

// Since I have access to write_to_file, I will just write a new googlePlaces.ts instead.
