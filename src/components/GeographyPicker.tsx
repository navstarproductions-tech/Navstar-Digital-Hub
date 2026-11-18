import { useEffect, useMemo, useState } from 'react';

type GeoRecord = { id?: string; level?: number; level_name?: { en?: string }; name?: { en?: string; local?: string } | string; parent?: { id?: string } | string; parent_id?: string; county?: string; children?: GeoRecord[] };
type Props = { county: string; subCounty: string; ward?: string; onChange: (values: { county: string; subCounty: string; ward: string }) => void };

const countyNames = ['Baringo','Bomet','Bungoma','Busia','Elgeyo-Marakwet','Embu','Garissa','Homa Bay','Isiolo','Kajiado','Kakamega','Kericho','Kiambu','Kilifi','Kirinyaga','Kisii','Kisumu','Kitui','Kwale','Laikipia','Lamu','Machakos','Makueni','Mandera','Marsabit','Meru','Migori','Mombasa','Murang’a','Nairobi','Nakuru','Nandi','Narok','Nyamira','Nyandarua','Nyeri','Samburu','Siaya','Taita-Taveta','Tana River','Tharaka-Nithi','Trans Nzoia','Turkana','Uasin Gishu','Vihiga','Wajir','West Pokot'];

function flatten(value: unknown): GeoRecord[] {
  const output: GeoRecord[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    const record = node as GeoRecord;
    if (record.level || record.level_name || record.name) output.push(record);
    if (record.children) visit(record.children);
    const obj = node as Record<string, unknown>;
    for (const key of ['data','divisions','records','items','administrative_units']) if (obj[key] && obj[key] !== record.children) visit(obj[key]);
  };
  visit(value);
  return output;
}
const label = (r: GeoRecord) => typeof r.name === 'string' ? r.name : r.name?.en || r.name?.local || r.level_name?.en || '';
const parentId = (r: GeoRecord) => typeof r.parent === 'string' ? r.parent : r.parent?.id || r.parent_id || '';

export function GeographyPicker({ county, subCounty, ward = '', onChange }: Props) {
  const [records, setRecords] = useState<GeoRecord[]>([]);
  useEffect(() => {
    let active = true;
    fetch('https://api.openadmindata.org/api/v1/countries/ke.json')
      .then(response => response.ok ? response.json() as Promise<unknown> : Promise.reject(new Error('Geography directory unavailable')))
      .then(data => { if (active) setRecords(flatten(data)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  const countyRecords = useMemo(() => records.filter(r => Number(r.level) === 1 || /county/i.test(r.level_name?.en || '')), [records]);
  const selectedCounty = countyRecords.find(r => label(r).toLowerCase() === county.toLowerCase());
  const subCountyRecords = useMemo(() => records.filter(r => Number(r.level) === 2 || /sub.?county|constituency/i.test(r.level_name?.en || '')), [records]);
  const wardRecords = useMemo(() => records.filter(r => Number(r.level) === 3 || /ward/i.test(r.level_name?.en || '')), [records]);
  const subCounties = subCountyRecords.filter(r => (selectedCounty?.id && parentId(r) === selectedCounty.id) || (r.county && r.county.toLowerCase() === county.toLowerCase()));
  const selectedSubCounty = subCounties.find(r => label(r).toLowerCase() === subCounty.toLowerCase());
  const wards = wardRecords.filter(r => (selectedSubCounty?.id && parentId(r) === selectedSubCounty.id) || (r.county && r.county.toLowerCase() === county.toLowerCase() && parentId(r) === selectedSubCounty?.id));
  const selectClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900';
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1"><label className="text-sm font-medium">Country</label><select className={selectClass} value="Kenya" disabled><option>Kenya</option></select></div>
    <div className="space-y-1"><label className="text-sm font-medium">County</label><select className={selectClass} value={county} onChange={e => onChange({ county: e.target.value, subCounty: '', ward: '' })}><option value="">Select county</option>{countyNames.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
    <div className="space-y-1"><label className="text-sm font-medium">Sub-county / constituency</label><select className={selectClass} value={subCounty} disabled={!county} onChange={e => onChange({ county, subCounty: e.target.value, ward: '' })}><option value="">Select sub-county</option>{subCounties.map(r => <option key={r.id || label(r)} value={label(r)}>{label(r)}</option>)}</select><p className="text-[11px] text-slate-500">Options load from the Kenya administrative divisions directory.</p></div>
    <div className="space-y-1"><label className="text-sm font-medium">Ward</label><select className={selectClass} value={ward} disabled={!subCounty} onChange={e => onChange({ county, subCounty, ward: e.target.value })}><option value="">Select ward</option>{wards.map(r => <option key={r.id || label(r)} value={label(r)}>{label(r)}</option>)}</select></div>
  </div>;
}
