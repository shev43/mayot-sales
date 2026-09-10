/** Префікс шляхів до public/: на GitHub Pages сайт живе під /mayot-sales, локально — без префікса */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (p: string) => `${BASE_PATH}${p}`;
