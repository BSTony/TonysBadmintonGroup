const gamesList = [];
const gameId = 'g1';
const name = 'A';

const games = {
  g1: {
    gameId: 'g1',
    sections: [{ list: ['A', 'B', 'C'], limit: 10 }],
    paidMap: { A: true, B: true, C: true }
  }
};

gamesList.push(JSON.parse(JSON.stringify(games.g1)));

const game = games[gameId];
const currentList = game.sections[0].list;
const idx = currentList.indexOf(name);
if (idx !== -1) {
  currentList.splice(idx, 1);
  // uiToNameMap.delete ...
}

const result = { success: true, game: games[gameId] };

const listIdx = gamesList.findIndex(g => g.gameId === gameId);
if (listIdx !== -1) gamesList[listIdx] = result.game;

const gToRender = gamesList.find(g => g.gameId === gameId);
console.log(gToRender.paidMap);
