declare module 'twgl.js' {
  export interface ProgramInfo {
    program: WebGLProgram;
    uniformSetters: Record<string, (v: any) => void>;
    attribSetters: Record<string, (v: any) => void>;
  }

  export interface BufferInfo {
    numElements: number;
    elementType?: number;
    indices?: WebGLBuffer;
    attribs: Record<string, any>;
  }

  export interface Arrays {
    position: {
      numComponents: number;
      data: number[] | Float32Array;
    };
    [key: string]: any;
  }

  export interface TextureOptions {
    src?: TexImageSource | string;
    width?: number;
    height?: number;
    min?: number;
    mag?: number;
    wrap?: number;
    format?: number;
    type?: number;
    [key: string]: any;
  }

  export function createProgramInfo(gl: WebGLRenderingContext | WebGL2RenderingContext, shaderSources: [string, string]): ProgramInfo;
  export function createBufferInfoFromArrays(gl: WebGLRenderingContext | WebGL2RenderingContext, arrays: Arrays): BufferInfo;
  export function setBuffersAndAttributes(gl: WebGLRenderingContext | WebGL2RenderingContext, programInfo: ProgramInfo, bufferInfo: BufferInfo): void;
  export function setUniforms(programInfo: ProgramInfo, uniforms: Record<string, any>): void;
  export function drawBufferInfo(gl: WebGLRenderingContext | WebGL2RenderingContext, bufferInfo: BufferInfo, type?: number, count?: number, offset?: number): void;
  export function createTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, options: TextureOptions, callback?: (err: any, tex: WebGLTexture, source: TexImageSource) => void): WebGLTexture;
}
