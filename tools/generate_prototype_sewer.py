from pathlib import Path
from mesh import Mesh


def build_sewer():
    mesh = Mesh()
    concrete = mesh.material("concrete", (0.31, 0.33, 0.30))
    wall = mesh.material("wall", (0.22, 0.25, 0.23))
    wall_light = mesh.material("wall_light", (0.40, 0.40, 0.34))
    metal = mesh.material("metal", (0.20, 0.24, 0.23))
    pipe = mesh.material("rusted_pipe", (0.43, 0.25, 0.13))
    water = mesh.material("sewage", (0.12, 0.20, 0.17))
    grate = mesh.material("grate", (0.10, 0.12, 0.12))
    warning = mesh.material("warning", (0.66, 0.43, 0.10))

    mesh.box((16.0, 0.24, 22.0), concrete, translate=(0, -0.12, 0))
    mesh.box((2.3, 0.035, 20.5), water, translate=(0, 0.018, 0))
    mesh.box((0.28, 0.055, 21.2), grate, translate=(-1.3, 0.028, 0))
    mesh.box((0.28, 0.055, 21.2), grate, translate=(1.3, 0.028, 0))

    for x in (-8.45, 8.45):
        mesh.box((0.55, 2.6, 23.0), wall, translate=(x, 1.3, 0))
        mesh.box((0.62, 0.24, 23.0), wall_light, translate=(x, 0.34, 0))
        mesh.box((0.68, 0.15, 23.0), metal, translate=(x, 2.42, 0))
        mesh.cylinder(
            0.19, 21.8, 8, pipe,
            translate=(x - (0.38 if x < 0 else -0.38), 1.1, 0),
            rotate=(1.57079632679, 0, 0)
        )
        for z in (-8.8, -5.5, -2.2, 2.2, 5.5, 8.8):
            mesh.box((0.06, 0.45, 1.05), warning, translate=(x * 0.92, 0.62, z))

    for z in (-11.2, 11.2):
        mesh.box((17.4, 2.6, 0.55), wall, translate=(0, 1.3, z))
        mesh.box((17.5, 0.18, 0.65), wall_light, translate=(0, 0.35, z))
        mesh.box((6.0, 1.8, 0.12), metal, translate=(0, 1.15, z - (0.33 if z < 0 else -0.33)))
        for x in (-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7):
            mesh.box((0.08, 1.5, 0.16), pipe, translate=(x, 1.15, z - (0.24 if z < 0 else -0.24)))

    for z in (-9, -6, -3, 0, 3, 6, 9):
        mesh.box((16.5, 0.16, 0.18), metal, translate=(0, 2.57, z))

    for x in (-6.7, 6.7):
        for z in (-7.7, 7.7):
            mesh.box((1.2, 0.62, 1.0), wall_light, translate=(x, 0.31, z))
            mesh.box((1.28, 0.08, 1.08), metal, translate=(x, 0.66, z))
            mesh.box((0.9, 0.06, 0.76), warning, translate=(x, 0.71, z))

    return mesh


if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "AthenaModels" / "prototype_sewer.obj"
    print(build_sewer().export(output))
