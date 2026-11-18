import { useEffect, useMemo, useState } from 'react';

type GeoRecord = {
  id?: string; level?: number; level_name?: { en?: string; local?: string };
  name?: { en?: string; local?: string } | string; name_en?: string; parent_id?: string;
  parent?: { id?: string } | string; children?: GeoRecord[];
};
type GeoValues = { county: string; subCounty: string; ward: string; location: string; subLocation: string };
type Props = {
  county: string; subCounty: string; ward?: string; location?: string; subLocation?: string;
  locations?: string[]; subLocations?: string[];
  onChange: (values: GeoValues) => void;
};

const countyNames = ['Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa','Murang’a','Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot'];

function parseRecords(value: unknown): GeoRecord[] {
  if (!value || typeof value !== 'object') return [];
  const root = value as Record<string, unknown>;
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const direct = ['county', 'subcounty', 'ward'].flatMap(key => Array.isArray(data[key]) ? data[key] as GeoRecord[] : []);
  if (direct.length) return direct;
  const result: GeoRecord[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    const record = node as GeoRecord;
    if (record.id && (record.level || record.level_name || record.name || record.name_en)) result.push(record);
    if (record.children) visit(record.children);
    const obj = node as Record<string, unknown>;
    for (const key of ['divisions','records','items','administrative_units','counties','subcounties','sub_counties','wards','county','subcounty','ward']) if (obj[key]) visit(obj[key]);
  };
  visit(data);
  return result;
}
const label = (record: GeoRecord) => typeof record.name === 'string' ? record.name : record.name?.en || record.name_en || record.level_name?.en || '';
const parentId = (record: GeoRecord) => typeof record.parent === 'string' ? record.parent : record.parent?.id || record.parent_id || '';
const level = (record: GeoRecord) => { const raw=String(record.level ?? record.level_name?.en ?? '').toLowerCase(); const numeric=Number(raw); if(Number.isFinite(numeric)&&numeric>0)return numeric; if(raw.includes('sub')&&raw.includes('count'))return 2; if(raw.includes('ward'))return 3; if(raw.includes('count'))return 1; return 0; };

export function GeographyPicker({ county, subCounty, ward = '', location = '', subLocation = '', locations = [], subLocations = [], onChange }: Props) {
  const [records, setRecords] = useState<GeoRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [configuredLocations, setConfiguredLocations] = useState<string[]>([]);
  const [configuredSubLocations, setConfiguredSubLocations] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/geography').then(response => response.ok ? response.json() as Promise<{locationOptions?:string[];subLocationOptions?:string[]}> : null).then(result => { if(active){setConfiguredLocations(result?.locationOptions || []);setConfiguredSubLocations(result?.subLocationOptions || []);} }).catch(() => undefined);
    fetch('https://api.openadmindata.org/api/v1/countries/ke.json')
      .then(response => response.ok ? response.json() as Promise<unknown> : Promise.reject(new Error('Geography directory unavailable')))
      .then(data => { if (active) { const parsed = parseRecords(data); setRecords(parsed); setLoadError(parsed.length === 0); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const countyRecords = useMemo(() => records.filter(record => level(record) === 1), [records]);
  const subCountyRecords = useMemo(() => records.filter(record => level(record) === 2), [records]);
  const wardRecords = useMemo(() => records.filter(record => level(record) === 3), [records]);
  const selectedCounty = countyRecords.find(record => label(record).toLowerCase() === county.toLowerCase());
  const subCounties = subCountyRecords.filter(record => parentId(record) === selectedCounty?.id);
  const selectedSubCounty = subCounties.find(record => label(record).toLowerCase() === subCounty.toLowerCase());
  const wards = wardRecords.filter(record => parentId(record) === selectedSubCounty?.id);
  const locationSource = locations.length ? locations : configuredLocations;
  const subLocationSource = subLocations.length ? subLocations : configuredSubLocations;
  const wardLocations = locationSource.map(value => value.split('|').map(part => part.trim())).filter(parts => parts.length > 1 && (!parts[0] || parts[0].toLowerCase() === ward.toLowerCase())).map(parts => parts[parts.length - 1]);
  const availableLocations = wardLocations.length ? wardLocations : locationSource.filter(value => !value.includes('|'));
  const selectedLocation = location.toLowerCase();
  const mappedSubLocations = subLocationSource.map(value => value.split('|').map(part => part.trim())).filter(parts => parts.length > 1 && parts[0].toLowerCase() === selectedLocation).map(parts => parts[parts.length - 1]);
  const availableSubLocations = mappedSubLocations.length ? mappedSubLocations : subLocationSource.filter(value => !value.includes('|'));
  const selectClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600';
  const update = (patch: Partial<GeoValues>) => onChange({ county, subCounty, ward, location, subLocation, ...patch });

  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1"><label className="text-sm font-medium">Country</label><select className={selectClass} value="Kenya" disabled><option>Kenya</option></select></div>
    <div className="space-y-1"><label className="text-sm font-medium">County</label><select className={selectClass} value={county} onChange={event => update({ county: event.target.value, subCounty: '', ward: '', location: '', subLocation: '' })}><option value="">Select county</option>{(countyRecords.length ? countyRecords.map(label) : countyNames).map(name => <option key={name} value={name}>{name}</option>)}</select></div>
    <div className="space-y-1"><label className="text-sm font-medium">Sub-county</label><select className={selectClass} value={subCounty} disabled={!county || subCounties.length === 0} onChange={event => update({ subCounty: event.target.value, ward: '', location: '', subLocation: '' })}><option value="">Select sub-county</option>{subCounties.map(record => <option key={record.id} value={label(record)}>{label(record)}</option>)}</select></div>
    <div className="space-y-1"><label className="text-sm font-medium">Ward</label><select className={selectClass} value={ward} disabled={!subCounty || wards.length === 0} onChange={event => update({ ward: event.target.value })}><option value="">Select ward</option>{wards.map(record => <option key={record.id} value={label(record)}>{label(record)}</option>)}</select></div>
    <div className="space-y-1"><label className="text-sm font-medium">Location</label><select className={selectClass} value={location} disabled={availableLocations.length === 0} onChange={event => update({ location: event.target.value, subLocation: '' })}><option value="">{availableLocations.length ? 'Select location' : 'No location options configured'}</option>{availableLocations.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <div className="space-y-1"><label className="text-sm font-medium">Sub-location</label><select className={selectClass} value={subLocation} disabled={!location || availableSubLocations.length === 0} onChange={event => update({ subLocation: event.target.value })}><option value="">{availableSubLocations.length ? 'Select sub-location' : 'No sub-location options configured'}</option>{availableSubLocations.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    {loadError && <p className="text-xs text-amber-700 sm:col-span-2">The live county directory could not be reached. County names remain available; reconnect to load sub-counties and wards.</p>}
    {(!availableLocations.length || !availableSubLocations.length) && <p className="text-xs text-slate-500 sm:col-span-2">Configure location entries as Ward|Location and sub-location entries as Location|Sub-location in Admin site settings. National county, sub-county and ward choices load from the Kenya administrative directory.</p>}
  </div>;
}
