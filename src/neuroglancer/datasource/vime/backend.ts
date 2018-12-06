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

import {WithParameters} from 'neuroglancer/chunk_manager/backend';
import {TileEncoding, TileSourceParameters} from 'neuroglancer/datasource/vime/base';
import {decodeJpegChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/jpeg';
import {VolumeChunk, VolumeChunkSource} from 'neuroglancer/sliceview/volume/backend';
import {registerSharedObject} from 'neuroglancer/worker_rpc';
import {CancellationToken} from 'neuroglancer/util/cancellation';
import {openShardedHttpRequest, sendHttpRequest} from 'neuroglancer/util/http_request';

const CHUNK_DECODERS = new Map([
    [TileEncoding.JPEG, decodeJpegChunk]
]);

@registerSharedObject()
export class VimeTileSource extends (WithParameters(VolumeChunkSource, TileSourceParameters)) {

    download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
        let chunkDecoder = CHUNK_DECODERS.get(TileEncoding.JPEG)!;

        let {parameters} = this;
        let {chunkGridPosition} = chunk;

        // Needed by JPEG decoder.
        chunk.chunkDataSize = this.spec.chunkDataSize;
    
        // VIME Neuroglancer Tile Source
        /* "/project/<project_name>/stack/<stack_name>" +
                "/neuroglancer/type/<mytype>/iteration/<int:iteration>" +
                "/file_iteration/<file_iteration>" +
                "/<int:width>/<int:height>/<int:scale_level>" +
                "/<int:slice_nr>/<int:row>/<int:column>.jpg"
        */
        // Derived from CATMAID Tile Source Type 5
        // <sourceBaseUrl><zoomLevel>/<pixelPosition.z>/<row>/<col>.<fileExtension>

        let path = '';
        path += `/project/${parameters.projectName}/stack/${parameters.stackName}/neuroglancer/type/${parameters.type}`;
        path += `/iteration/${parameters.iteration}/file_iteration/${parameters.fileIteration}/${parameters.renderTileWidth}/${parameters.renderTileHeight}/${parameters.zoomLevel}/${chunkGridPosition[2]}/${chunkGridPosition[1]}/${chunkGridPosition[0]}.jpg`;

        return sendHttpRequest(openShardedHttpRequest(parameters.sourceBaseUrls, path), 'arraybuffer', cancellationToken).then(response => chunkDecoder(chunk, response));
    }

}
