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


export enum TileEncoding {
  JPEG
}

export enum FileExtension {
  JPG,
  JPEG
}

export class TileSourceParameters {
  sourceBaseUrls: string[];
  encoding: TileEncoding;
  zoomLevel: number;
  renderTileWidth: number;
  renderTileHeight: number;
  iteration: number;
  fileIteration: number;
  type: string;
  projectName: string;
  stackName: string;
  
  static RPC_ID = 'vime/TileSource';  
}