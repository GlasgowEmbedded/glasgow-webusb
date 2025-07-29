export function truthyFilter<T>(value: T | false): value is T {
    return !!value;
}
