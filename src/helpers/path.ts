export const joinPath = (...segments: (string | { name: string } | null)[]) => {
    return segments
        .flatMap((segment) => {
            if (!segment) return [];
            const name = typeof segment === 'string' ? segment : segment.name;
            const segments = name.split('/').filter(segment => segment !== '');
            if (name.startsWith('/')) {
                segments[0] = `/${segments[0] ?? ''}`;
            }
            return segments;
        })
        .reduce((acc, cur) => {
            if (cur === '..') {
                acc.pop();
            } else if (cur !== '.') {
                if (cur.startsWith('/')) {
                    acc.length = 0;
                }
                acc.push(cur);
            }
            return acc;
        }, [] as string[])
        .join('/');
};
