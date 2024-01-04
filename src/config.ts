/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Configuration parameters shared by the point precomputation and the
 * map generator. Some of these objects are empty because they will be
 * filled in by the map generator.
 */


export interface MeshConfig {
    seed: number;
}
export interface ElevationConfig {
    seed: number;
    island: number;
    noisy_coastlines: number;
    hill_height: number;
    mountain_jagged: number;
    mountain_sharpness: number;
    ocean_depth: number;
}

export interface BiomeConfig {
    wind_angle_deg: number;
    raininess: number;
    rain_shadow: number;
    evaporation: number;
}

export interface RiverConfig {
    lg_min_flow: number;
lg_river_width: number;
flow: number;
}

export interface RenderConfig {
    zoom: number;
    x: number;
    y: number;
    light_angle_deg: number;
    slope: number;
    flat: number;
    ambient: number;
    overhead: number;
    tilt_deg: number;
    rotate_deg: number;
    mountain_height: number;
    outline_depth: number;
    outline_strength: number;
    outline_threshold: number;
    outline_coast: number;
    outline_water: number;
    biome_colors: number;
}

export interface Config {
    spacing: number;
    mountainSpacing: number;
    mesh: MeshConfig;
    elevation: ElevationConfig;
    biomes: BiomeConfig,
    rivers: RiverConfig,
    render: RenderConfig
}

export default {
    spacing: 5.5,
    mountainSpacing: 35,
    mesh: {
        seed: 12345,
    },
    elevation: {
        island: 0.8,
        hill_height: .1,
        mountain_sharpness: 12.5
    },
    biomes: {
    },
    rivers: {
    },
    render: {
    },
} as Config;
