import { Tree } from '@yowasp/runtime';

export interface PackagesMessage {
    type: 'packages',
    packages: { [name: string]: string }
}

export interface BuildMessage {
    type: 'build',
    files: Tree,
    scriptName: string
}

export interface OutputMessage {
    type: 'output',
    bytes: Uint8Array
}

export interface ResultMessage {
    type: 'result',
    code: number,
    files: Tree
}

export interface ErrorMessage {
    type: 'error',
    error: Error
}

export type AppToBuilderMessage =
    | BuildMessage;

export type BuilderToAppMessage =
    | PackagesMessage
    | OutputMessage
    | ResultMessage
    | ErrorMessage;
