export function modulo(divident: number, divisor: number) {
    return ((divident % divisor) + divisor) % divisor;
}
