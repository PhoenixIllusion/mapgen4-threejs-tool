/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module uses webgl+regl to render the generated maps
 */

import {vec2, vec4, mat4} from 'gl-matrix';
import Geometry from "./map-gen-4/geometry";
import type {Mesh} from "./map-gen-4/types.d";

import REGL from 'regl/dist/regl';
// NOTE: the typescript definition for regl.prop so cumbersome I don't use it
const regl = REGL({
    canvas: "#mapgen4",
    extensions: ['OES_element_index_uint']
});


const river_texturemap = regl.texture({data: Geometry.createRiverBitmap(), mipmap: 'nice', min: 'mipmap', mag: 'linear', premultiplyAlpha: true});
const fbo_texture_size = 2048;
const fbo_depth_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_z = regl.framebuffer({color: fbo_depth_texture});
const fbo_river_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size});
const fbo_river = regl.framebuffer({color: fbo_river_texture});
const fbo_final_texture = regl.texture({width: fbo_texture_size, height: fbo_texture_size, min: 'linear', mag: 'linear'});
const fbo_final = regl.framebuffer({color: fbo_final_texture});


/* draw rivers to a texture, which will be draped on the map surface */

interface DrawRiversUniforms {
    u_projection: mat4,
    u_rivertexturemap: REGL.Texture2D
};

interface DrawRiversAttributes {
    a_xyuv: REGL.Buffer
};

interface DrawRiversP {
    count: number,
};

interface DrawRiversProps extends DrawRiversAttributes, DrawRiversUniforms, DrawRiversP {}

const drawRivers = regl<DrawRiversUniforms, DrawRiversAttributes, DrawRiversProps>({
    frag: `
precision mediump float;
uniform sampler2D u_rivertexturemap;
varying vec2 v_uv;
const vec3 blue = vec3(0.2, 0.5, 0.7);
void main() {
   vec4 color = texture2D(u_rivertexturemap, v_uv);
   gl_FragColor = vec4(blue * color.a, color.a);
   // gl_FragColor = color;
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec4 a_xyuv;
varying vec2 v_uv;
void main() {
  v_uv = a_xyuv.ba;
  gl_Position = vec4(u_projection * vec4(a_xyuv.xy, 0, 1));
}`,
    
    uniforms:  {
        u_projection: regl.prop<DrawRiversUniforms, keyof DrawRiversUniforms>('u_projection'),
        u_rivertexturemap: river_texturemap,
    },

    framebuffer: fbo_river,
    blend: {
        enable: true,
        func: {src:'one', dst:'one minus src alpha'},
        equation: {
            rgb: 'add',
            alpha: 'add'
        },
    color: [0, 0, 0, 0]
    },
    depth: {
        enable: false,
    },
    count: regl.prop<DrawRiversP, keyof DrawRiversP>('count'),
    attributes: {
        a_xyuv: regl.prop<DrawRiversAttributes, keyof DrawRiversAttributes>('a_xyuv'),
    },
});


interface DrawLandUniforms {
    u_projection: mat4,
    u_water: REGL.Texture2D,
    u_outline_water: number,
};

interface DrawLandAttributes {
    a_xy: REGL.Buffer,
    a_em: REGL.Buffer
};

interface DrawLandP {
    elements: REGL.Elements,
};

interface DrawLandProps extends DrawLandAttributes, DrawLandUniforms, DrawLandP {}

/* write 16-bit elevation to a texture's G,R channels; the B,A channels are empty */
const drawLand = regl<DrawLandUniforms, DrawLandAttributes, DrawLandProps>({
    frag: `
precision highp float;
uniform sampler2D u_water;
uniform float u_outline_water;
varying float v_e;
varying vec2 v_xy;
void main() {
   float e = 0.5 * (1.0 + v_e);
   float river = texture2D(u_water, v_xy).a;
   if (e >= 0.5) {
      float bump = u_outline_water / 256.0;
      float L1 = e + bump;
      float L2 = (e - 0.5) * (bump * 100.0) + 0.5;
      // TODO: simplify equation
      e = min(L1, mix(L1, L2, river));
   }
   gl_FragColor = vec4(e, e, e, 1);
   // NOTE: it should be using the floor instead of rounding, but
   // rounding produces a nice looking artifact, so I'll keep that
   // until I can produce the artifact properly (e.g. bug → feature).
   // Using linear filtering on the texture also smooths out the artifacts.
   //  gl_FragColor = vec4(fract(256.0*e), floor(256.0*e)/256.0, 0, 1);
   // NOTE: need to use GL_NEAREST filtering for this texture because
   // blending R,G channels independently isn't going to give the right answer
}`,

    vert: `
precision highp float;
uniform mat4 u_projection;
attribute vec2 a_xy;
attribute vec2 a_em; // NOTE: moisture channel unused
varying float v_e;
varying vec2 v_xy;
void main() {
    vec4 pos = vec4(u_projection * vec4(a_xy.x, a_xy.y, 0, 1));
    pos.y *= -1.0;
    v_xy = (1.0 + pos.xy) * 0.5;
    v_e = a_em.x;
    gl_Position = pos;
}`,

    uniforms:  {
        u_projection: regl.prop<DrawLandProps, keyof DrawLandProps>('u_projection'),
        u_water: regl.prop<DrawLandUniforms, keyof DrawLandUniforms>('u_water'),
        u_outline_water: regl.prop<DrawLandUniforms, keyof DrawLandUniforms>('u_outline_water')
    },

    //framebuffer: fbo_land,
    depth: {
        enable: false,
    },
    elements: regl.prop<DrawLandP, keyof DrawLandP>('elements'),
    attributes: {
        a_xy: regl.prop<DrawLandAttributes, keyof DrawLandAttributes>('a_xy'),
        a_em: regl.prop<DrawLandAttributes, keyof DrawLandAttributes>('a_em'),
    },
});


class Renderer {
    numRiverTriangles: number = 0;
    
    topdown: mat4;
    projection: mat4;
    inverse_projection: mat4;
    
    a_quad_xy: Float32Array;
    a_quad_em: Float32Array;
    quad_elements: Int32Array;
    a_river_xyuv: Float32Array;

    buffer_quad_xy: REGL.Buffer;
    buffer_quad_em: REGL.Buffer;
    buffer_river_xyuv: REGL.Buffer;
    buffer_quad_elements: REGL.Elements;

    screenshotCanvas: HTMLCanvasElement;
    screenshotCallback: () => void;
    renderParam: any;
    
    constructor (mesh: Mesh) {
        this.resizeCanvas();
        
        this.topdown = mat4.create();
        mat4.translate(this.topdown, this.topdown, [-1, -1, 0]);
        mat4.scale(this.topdown, this.topdown, [1/500, 1/500, 1]);

        this.projection = mat4.create();
        this.inverse_projection = mat4.create();
        
        this.a_quad_xy = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.a_quad_em = new Float32Array(2 * (mesh.numRegions + mesh.numTriangles));
        this.quad_elements = new Int32Array(3 * mesh.numSolidSides);
        /* NOTE: The maximum number of river triangles will be when
         * there's a single binary tree that has every node filled.
         * Each of the N/2 leaves will produce 1 output triangle and
         * each of the N/2 nodes will produce 2 triangles. On average
         * there will be 1.5 output triangles per input triangle. */
        this.a_river_xyuv = new Float32Array(1.5 * 3 * 4 * mesh.numSolidTriangles);
        
        Geometry.setMeshGeometry(mesh, this.a_quad_xy);
        
        this.buffer_quad_xy = regl.buffer({
            usage: 'static',
            type: 'float',
            data: this.a_quad_xy,
        });

        this.buffer_quad_em = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_quad_em.length,
        });

        this.buffer_quad_elements = regl.elements({
            primitive: 'triangles',
            usage: 'dynamic',
            type: 'uint32',
            length: 4 * this.quad_elements.length,
            count: this.quad_elements.length,
        });

        this.buffer_river_xyuv = regl.buffer({
            usage: 'dynamic',
            type: 'float',
            length: 4 * this.a_river_xyuv.length,
        });

        this.screenshotCanvas = document.createElement('canvas');
        this.screenshotCanvas.width = fbo_texture_size;
        this.screenshotCanvas.height = fbo_texture_size;
        this.screenshotCallback = null as any;
        
        this.renderParam = undefined;
        this.startDrawingLoop();
    }

    screenToWorld(coords: [number, number]): vec2 {
        /* convert from screen 2d (inverted y) to 4d for matrix multiply */
        let glCoords = vec4.fromValues(
            coords[0] * 2 - 1,
            1 - coords[1] * 2,
            /* TODO: z should be 0 only when tilt_deg is 0;
             * need to figure out the proper z value here */
            0,
            1
        );
        /* it returns vec4 but we only need vec2; they're compatible */
        let transformed = vec4.transformMat4(vec4.create(), glCoords, this.inverse_projection);
        return [transformed[0], transformed[1]];
    }
    
    /* Update the buffers with the latest map data */
    updateMap() {
        this.buffer_quad_em.subdata(this.a_quad_em);
        this.buffer_quad_elements.subdata(this.quad_elements);
        this.buffer_river_xyuv.subdata(this.a_river_xyuv.subarray(0, 4 * 3 * this.numRiverTriangles));
    }

    /* Allow drawing at a different resolution than the internal texture size */
    resizeCanvas() {
        let canvas = document.getElementById('mapgen4') as HTMLCanvasElement;
        let size = canvas.clientWidth;
        size = 2048; /* could be smaller to increase performance */
        if (canvas.width !== size || canvas.height !== size) {
            console.log(`Resizing canvas from ${canvas.width}x${canvas.height} to ${size}x${size}`);
            canvas.width = canvas.height = size;
            regl.poll();
        }
    }

    startDrawingLoop() {
        function clearBuffers() {
            // I don't have to clear fbo_em because it doesn't have depth
            // and will be redrawn every frame. I do have to clear
            // fbo_river because even though it doesn't have depth, it
            // doesn't draw all triangles.
            fbo_river.use(() => {
                regl.clear({color: [0, 0, 0, 0]});
            });
            fbo_z.use(() => {
                regl.clear({color: [0, 0, 0, 1], depth: 1});
            });
            fbo_final.use(() => {
                regl.clear({color: [0.3, 0.3, 0.35, 1], depth: 1});
            });
        }

        /* Only draw when render parameters have been passed in;
         * otherwise skip the render and wait for the next tick */
        clearBuffers();
        regl.frame(_context => {
            const renderParam = this.renderParam;
            if (!renderParam) { return; }
            this.renderParam = undefined;

            if (this.numRiverTriangles > 0) {
                const props: Partial<DrawRiversProps> = {
                    count: 3 * this.numRiverTriangles,
                    a_xyuv: this.buffer_river_xyuv,
                    u_projection: this.topdown
                }
                
                drawRivers(props);
            }
            
            const props: DrawLandProps = {
                elements: this.buffer_quad_elements,
                a_xy: this.buffer_quad_xy,
                a_em: this.buffer_quad_em,
                u_projection: this.topdown,
                u_water: fbo_river_texture,
                u_outline_water: renderParam.outline_water,
            }

            drawLand(props);

            /* Standard rotation for orthographic view */
            mat4.identity(this.projection);
            mat4.rotateX(this.projection, this.projection, (180 + renderParam.tilt_deg) * Math.PI/180);
            mat4.rotateZ(this.projection, this.projection, renderParam.rotate_deg * Math.PI/180);
            
            /* Top-down oblique copies column 2 (y input) to row 3 (z
             * output). Typical matrix libraries such as glm's mat4 or
             * Unity's Matrix4x4 or Unreal's FMatrix don't have this
             * this.projection built-in. For mapgen4 I merge orthographic
             * (which will *move* part of y-input to z-output) and
             * top-down oblique (which will *copy* y-input to z-output).
             * <https://en.wikipedia.org/wiki/Oblique_projection> */
            this.projection[9] = 1;
            
            /* Scale and translate works on the hybrid this.projection */
            mat4.scale(this.projection, this.projection, [renderParam.zoom/100, renderParam.zoom/100, renderParam.mountain_height * renderParam.zoom/100]);
            mat4.translate(this.projection, this.projection, [-renderParam.x, -renderParam.y, 0]);

            /* Keep track of the inverse matrix for mapping mouse to world coordinates */
            mat4.invert(this.inverse_projection, this.projection);


            if (this.screenshotCallback) {
                // TODO: regl says I need to use preserveDrawingBuffer
                const gl = regl._gl;
                const ctx = this.screenshotCanvas.getContext('2d')!;
                const imageData = ctx.getImageData(0, 0, fbo_texture_size, fbo_texture_size);
                const bytesPerRow = 4 * fbo_texture_size;
                const buffer = new Uint8Array(bytesPerRow * fbo_texture_size);
                gl.readPixels(0, 0, fbo_texture_size, fbo_texture_size, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

                // Flip row order from WebGL to Canvas
                for (let y = 0; y < fbo_texture_size; y++) {
                    const rowBuffer = new Uint8Array(buffer.buffer, y * bytesPerRow, bytesPerRow);
                    imageData.data.set(rowBuffer, (fbo_texture_size-y-1) * bytesPerRow);
                }
                ctx.putImageData(imageData, 0, 0);

                this.screenshotCallback();
                this.screenshotCallback = null as any;
            }

            clearBuffers();
        });
    }
    

    updateView(renderParam: any) {
        this.renderParam = renderParam;
    }
}

export default Renderer;
