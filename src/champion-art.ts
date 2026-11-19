import catalog from './riot-champions.json' with { type: 'json' };

const key = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const filenames = new Map(Object.entries(catalog.images).map(([name, file]) => [key(name), file]));

export function championImage(name: string) {
  const file = filenames.get(key(name));
  return file ? `https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/champion/${file}` : undefined;
}
