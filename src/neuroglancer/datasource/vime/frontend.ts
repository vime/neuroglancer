/**
 * @license
 * Copyright 2018 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChunkManager, WithParameters } from 'neuroglancer/chunk_manager/frontend';
import { TileSourceParameters, TileEncoding } from 'neuroglancer/datasource/vime/base';
import { DataSource } from 'neuroglancer/datasource';
import { MultiscaleVolumeChunkSource as GenericMultiscaleVolumeChunkSource, VolumeChunkSource } from 'neuroglancer/sliceview/volume/frontend';
import { DataType, VolumeChunkSpecification, VolumeSourceOptions, VolumeType } from 'neuroglancer/sliceview/volume/base';
import { verifyFloat, verifyInt, verifyObject, verifyObjectProperty, verifyString } from 'neuroglancer/util/json';
import { openShardedHttpRequest, sendHttpRequest } from 'neuroglancer/util/http_request';
import { vec3 } from 'neuroglancer/util/geom';


class VimeTileSource extends (WithParameters(VolumeChunkSource, TileSourceParameters)) { }

interface StackInfo {
    overlapMax: number;
    gridNr: number;
    dimension: vec3;
    translation: vec3;
    resolution: vec3;
    zoomLevels: number;
    renderTileHeight: number;
    renderTileWidth: number;
    iteration: number;
    fileIteration: number;
    projectName: string;
    stackName: string;
    type: string;
}


function parseStackInfo(obj: any): StackInfo {
    verifyObject(obj);

    function verifyObjectVec(obj: any, vecField: string, typeVerifier: (...args: any[]) => number): vec3 {
        return verifyObjectProperty(obj, vecField, vecObj => {
            let x = verifyObjectProperty(vecObj, 'x', typeVerifier);
            let y = verifyObjectProperty(vecObj, 'y', typeVerifier);
            let z = verifyObjectProperty(vecObj, 'z', typeVerifier);
            return vec3.fromValues(x, y, z);
        })
    }

    let dimension = verifyObjectVec(obj, 'dimension', verifyInt);
    let translation = verifyObjectVec(obj, 'translation', verifyInt);
    let resolution = verifyObjectVec(obj, 'resolution', verifyFloat);

    let zoomLevels = verifyObjectProperty(obj, 'num_zoom_levels', verifyInt);

    let renderTileHeight = verifyObjectProperty(obj, 'render_tile_height', verifyInt);
    let renderTileWidth = verifyObjectProperty(obj, 'render_tile_width', verifyInt);

    let overlapMax = verifyObjectProperty(obj, 'overlap_max', verifyInt);
    let gridNr = verifyObjectProperty(obj, 'grid_nr', verifyInt);
    let iteration = verifyObjectProperty(obj, 'iteration', verifyInt);
    let fileIteration = verifyObjectProperty(obj, 'file_iteration', verifyInt);

    let projectName = verifyObjectProperty(obj, 'project_name', verifyString);
    let stackName = verifyObjectProperty(obj, 'stack_name', verifyString);
    let type = verifyObjectProperty(obj, 'type', verifyString);

    return {dimension, translation, resolution, zoomLevels, renderTileHeight, renderTileWidth, iteration, fileIteration, projectName, stackName, type, overlapMax, gridNr};
}


export class MultiscaleTileSource implements GenericMultiscaleVolumeChunkSource {
    get dataType() {
        return DataType.UINT8;
    }
    get numChannels() {
        return 1;
    }
    get volumeType() {
        return VolumeType.IMAGE;
    }

    encoding: TileEncoding;

    constructor(
            public chunkManager: ChunkManager,
            public url: string,
            public stackInfo: StackInfo,
            public parameters: {[index: string]: any} = {}) {

        if (stackInfo === undefined) {
            throw new Error(`Failed to read stack information for stack from VIME.`);
        }

        this.encoding = TileEncoding.JPEG;
    }

    getSources(volumeSourceOptions: VolumeSourceOptions) {
        let sources: VolumeChunkSource[][] = [];
        let numLevels = this.stackInfo.zoomLevels;

        // Zoom level of -1 indicates the maximum zoom level is such that the
        // XY-extents of the stack at that level are less than 1K.
        if (numLevels < 0) {
            numLevels = Math.ceil(Math.max(Math.log2(this.stackInfo.dimension[0] / 1024),
                                           Math.log2(this.stackInfo.dimension[1] / 1024)));
        }

        for (let level = 0; level <= numLevels; level++) {
            let voxelSize = vec3.clone(this.stackInfo.resolution);
            let chunkDataSize = vec3.fromValues(1, 1, 1);

            for(let i=0; i<2; ++i) {
                voxelSize[i] = voxelSize[i] * Math.pow(2, level);
            }

            chunkDataSize[0] = this.stackInfo.renderTileWidth;
            chunkDataSize[1] = this.stackInfo.renderTileHeight;

            let lowerVoxelBound = vec3.create(), upperVoxelBound = vec3.clone(this.stackInfo.dimension);

            let spec = VolumeChunkSpecification.make({
                voxelSize,
                chunkDataSize,
                numChannels: this.numChannels,
                dataType: this.dataType,
                lowerVoxelBound,
                upperVoxelBound,
                volumeSourceOptions
            });

            let source = this.chunkManager.getChunkSource(VimeTileSource, {
                spec,
                parameters: {
                    'sourceBaseUrls': this.url,
                    'encoding': this.encoding,
                    'zoomLevel': level,
                    'renderTileHeight': this.stackInfo.renderTileHeight,
                    'renderTileWidth': this.stackInfo.renderTileWidth,
                    'iteration': this.stackInfo.iteration,
                    'fileIteration': this.stackInfo.fileIteration,
                    'type': this.stackInfo.type,
                    'projectName': this.stackInfo.projectName,
                    'stackName': this.stackInfo.stackName
                }
            });

            sources.push([source]);
        }
        return sources;
    }

    /**
     * Meshes are not supported.
     */
    getMeshSource(): null {
        return null;
    }
}

export function getVolume(chunkManager: ChunkManager, path: string) {

    let protocol = path.split('//')[0];
    let urlarray = path.split('//')[1].split('/');

    const url = protocol + '//' + urlarray[0];
    const project_name = urlarray[2];
    const stack_name = urlarray[4];
    const mytype = urlarray[6];
    const iteration = urlarray[7];
    const file_iteration = urlarray[8];

    return chunkManager.memoize.getUncounted(
                { type: 'vime:MultiscaleVolumeChunkSource', url, path },
                () => getStackInfo(chunkManager, url, project_name, stack_name, mytype, Number(iteration), Number(file_iteration)).then(stackInfo => {
                    return new MultiscaleTileSource(chunkManager, url, stackInfo);
                }));
}

export function getStackInfo(chunkManager: ChunkManager, url: string, project_name: string, stack_name: string, mytype: string, iteration: number, file_iteration: number) {
    return chunkManager.memoize.getUncounted(
            { type: 'vime:getStackInfo', url, project_name, stack_name, mytype, iteration, file_iteration },
            () => sendHttpRequest(openShardedHttpRequest(url, `/project/${project_name}/stack/${stack_name}/type/${mytype}/${iteration}/${file_iteration}/stackinfo`), 'json')
        .then(parseStackInfo));
}

export class VimeDataSource extends DataSource {
    get description() {
        return 'Vime';
    }

    getVolume(chunkManager: ChunkManager, url: string) {
        return getVolume(chunkManager, url);
    }

}
