// Catalogue de jeux populaires, par plateforme. Recherche dans « Mes jeux » ; un jeu absent peut être saisi à la main.
export const PLATFORMS = ['Steam', 'Epic', 'Battle.net', 'Riot', 'EA App', 'Ubisoft', 'GOG', 'Xbox', 'PlayStation', 'Nintendo'];

const G = (name, ...platforms) => ({ name, platforms });
export const GAME_CATALOG = [
  G('Counter-Strike 2', 'Steam'), G('Dota 2', 'Steam'), G('Team Fortress 2', 'Steam'), G('Garry’s Mod', 'Steam'),
  G('Rust', 'Steam'), G('Terraria', 'Steam'), G('Stardew Valley', 'Steam', 'Xbox', 'PlayStation', 'Nintendo'),
  G('Hades', 'Steam', 'Xbox', 'PlayStation', 'Nintendo'), G('Hollow Knight', 'Steam', 'Xbox', 'PlayStation', 'Nintendo'),
  G('Among Us', 'Steam', 'Xbox', 'PlayStation', 'Nintendo'), G('Valheim', 'Steam', 'Xbox'), G('Palworld', 'Steam', 'Xbox'),
  G('Baldur’s Gate 3', 'Steam', 'GOG', 'PlayStation', 'Xbox'), G('Cyberpunk 2077', 'Steam', 'GOG', 'PlayStation', 'Xbox'),
  G('The Witcher 3: Wild Hunt', 'Steam', 'GOG', 'PlayStation', 'Xbox', 'Nintendo'), G('Elden Ring', 'Steam', 'PlayStation', 'Xbox'),
  G('Dark Souls III', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'), G('Sekiro: Shadows Die Twice', 'Steam', 'PlayStation', 'Xbox'),
  G('Monster Hunter Wilds', 'Steam', 'PlayStation', 'Xbox'), G('PUBG: Battlegrounds', 'Steam', 'Xbox', 'PlayStation'),
  G('Apex Legends', 'Steam', 'EA App', 'PlayStation', 'Xbox', 'Nintendo'), G('Dead by Daylight', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'),
  G('Euro Truck Simulator 2', 'Steam'), G('Civilization VI', 'Steam', 'Nintendo', 'PlayStation', 'Xbox'),
  G('Cities: Skylines II', 'Steam', 'PlayStation', 'Xbox'), G('Factorio', 'Steam', 'Nintendo'), G('Satisfactory', 'Steam', 'Epic'),
  G('Deep Rock Galactic', 'Steam', 'PlayStation', 'Xbox'), G('Helldivers 2', 'Steam', 'PlayStation', 'Xbox'),
  G('Lethal Company', 'Steam'), G('Phasmophobia', 'Steam', 'Xbox'), G('Left 4 Dead 2', 'Steam'), G('Portal 2', 'Steam'),
  G('Half-Life 2', 'Steam'), G('Warframe', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'), G('Path of Exile', 'Steam', 'PlayStation', 'Xbox'),
  G('Sea of Thieves', 'Xbox', 'Steam'), G('Hogwarts Legacy', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'),
  G('Lost Ark', 'Steam'), G('New World', 'Steam'), G('Destiny 2', 'Steam', 'PlayStation', 'Xbox'),
  G('Starfield', 'Steam', 'Xbox'), G('Fallout 4', 'Steam', 'PlayStation', 'Xbox'),
  G('The Elder Scrolls V: Skyrim', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'), G('Minecraft', 'Xbox', 'PlayStation', 'Nintendo', 'Steam'),
  G('Valorant', 'Riot'), G('League of Legends', 'Riot'), G('Teamfight Tactics', 'Riot'), G('Legends of Runeterra', 'Riot'),
  G('Fortnite', 'Epic', 'PlayStation', 'Xbox', 'Nintendo'), G('Rocket League', 'Epic', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'),
  G('Fall Guys', 'Epic', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'),
  G('Diablo IV', 'Battle.net', 'PlayStation', 'Xbox'), G('Overwatch 2', 'Battle.net', 'PlayStation', 'Xbox', 'Nintendo'),
  G('World of Warcraft', 'Battle.net'), G('StarCraft II', 'Battle.net'), G('Hearthstone', 'Battle.net'),
  G('Heroes of the Storm', 'Battle.net'), G('Call of Duty: Warzone', 'Battle.net', 'PlayStation', 'Xbox'),
  G('Call of Duty: Black Ops 6', 'Battle.net', 'PlayStation', 'Xbox'),
  G('Rainbow Six Siege', 'Ubisoft', 'Steam', 'PlayStation', 'Xbox'), G('Assassin’s Creed Valhalla', 'Ubisoft', 'Steam', 'PlayStation', 'Xbox'),
  G('The Division 2', 'Ubisoft', 'Steam', 'PlayStation', 'Xbox'), G('Far Cry 6', 'Ubisoft', 'Steam', 'PlayStation', 'Xbox'),
  G('Ghost Recon Breakpoint', 'Ubisoft', 'Steam', 'PlayStation', 'Xbox'),
  G('EA Sports FC 25', 'EA App', 'Steam', 'PlayStation', 'Xbox', 'Nintendo'), G('Battlefield 2042', 'EA App', 'Steam', 'PlayStation', 'Xbox'),
  G('The Sims 4', 'EA App', 'Steam', 'PlayStation', 'Xbox'), G('Need for Speed Unbound', 'EA App', 'Steam', 'PlayStation', 'Xbox'),
  G('Grand Theft Auto V', 'Steam', 'Epic', 'PlayStation', 'Xbox'), G('Red Dead Redemption 2', 'Steam', 'PlayStation', 'Xbox'),
  G('Forza Horizon 5', 'Steam', 'Xbox'), G('Halo Infinite', 'Steam', 'Xbox'), G('Gears 5', 'Steam', 'Xbox'),
  G('Microsoft Flight Simulator 2024', 'Steam', 'Xbox'), G('Hunt: Showdown', 'Steam'),
  G('Gran Turismo 7', 'PlayStation'), G('Marvel’s Spider-Man 2', 'PlayStation'), G('God of War Ragnarök', 'PlayStation', 'Steam'),
  G('The Last of Us Part II', 'PlayStation', 'Steam'), G('Horizon Forbidden West', 'PlayStation', 'Steam'),
  G('Ratchet & Clank: Rift Apart', 'PlayStation', 'Steam'),
  G('Mario Kart 8 Deluxe', 'Nintendo'), G('Super Smash Bros. Ultimate', 'Nintendo'), G('Animal Crossing: New Horizons', 'Nintendo'),
  G('Splatoon 3', 'Nintendo'), G('The Legend of Zelda: Tears of the Kingdom', 'Nintendo'), G('Pokémon Scarlet et Violet', 'Nintendo'),
  G('Super Mario Odyssey', 'Nintendo'),
];
// Recherche : sans accents ni casse, sur le nom ; filtre facultatif par plateforme.
const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function searchGames(query, platform = '') {
  const q = fold(query.trim());
  return GAME_CATALOG.filter((g) => (!platform || g.platforms.includes(platform)) && (!q || fold(g.name).includes(q)));
}
