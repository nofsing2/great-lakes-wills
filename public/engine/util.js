// Small helpers shared by the browser and the server.

export function get(obj, path, fallback = undefined) {
  if (!path) return obj;
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur == null) return fallback;
    cur = cur[key];
  }
  return cur === undefined ? fallback : cur;
}

export function set(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  keys.slice(0, -1).forEach((k) => {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
  return obj;
}

export function fullName(p) {
  if (!p) return '';
  if (typeof p === 'string') return p.trim();
  if (p.name) return String(p.name).trim();
  return [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function personLabel(p) {
  if (!p || !fullName(p)) return '';
  const bits = [fullName(p)];
  if (p.relationship) bits.push(`my ${p.relationship}`);
  return bits.join(', ');
}

export function ageOn(dob, onDate = new Date()) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let age = onDate.getFullYear() - d.getFullYear();
  const m = onDate.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && onDate.getDate() < d.getDate())) age -= 1;
  return age;
}

export function money(n) {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// A price for display: "No charge" for zero.
export function priceText(n) {
  return Number(n) ? money(n) : 'No charge';
}

export function listJoin(items, conj = 'and') {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join('');
  if (xs.length === 2) return `${xs[0]} ${conj} ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')}, ${conj} ${xs[xs.length - 1]}`;
}

export function ordinalWord(n) {
  return ['first', 'second', 'third', 'fourth', 'fifth'][n] || `${n + 1}th`;
}

export function isFilled(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.values(v).some(isFilled);
  return true;
}

export const MICHIGAN_COUNTIES = [
  'Alcona', 'Alger', 'Allegan', 'Alpena', 'Antrim', 'Arenac', 'Baraga', 'Barry', 'Bay', 'Benzie', 'Berrien',
  'Branch', 'Calhoun', 'Cass', 'Charlevoix', 'Cheboygan', 'Chippewa', 'Clare', 'Clinton', 'Crawford', 'Delta',
  'Dickinson', 'Eaton', 'Emmet', 'Genesee', 'Gladwin', 'Gogebic', 'Grand Traverse', 'Gratiot', 'Hillsdale',
  'Houghton', 'Huron', 'Ingham', 'Ionia', 'Iosco', 'Iron', 'Isabella', 'Jackson', 'Kalamazoo', 'Kalkaska', 'Kent',
  'Keweenaw', 'Lake', 'Lapeer', 'Leelanau', 'Lenawee', 'Livingston', 'Luce', 'Mackinac', 'Macomb', 'Manistee',
  'Marquette', 'Mason', 'Mecosta', 'Menominee', 'Midland', 'Missaukee', 'Monroe', 'Montcalm', 'Montmorency',
  'Muskegon', 'Newaygo', 'Oakland', 'Oceana', 'Ogemaw', 'Ontonagon', 'Osceola', 'Oscoda', 'Otsego', 'Ottawa',
  'Presque Isle', 'Roscommon', 'Saginaw', 'St. Clair', 'St. Joseph', 'Sanilac', 'Schoolcraft', 'Shiawassee',
  'Tuscola', 'Van Buren', 'Washtenaw', 'Wayne', 'Wexford',
];
