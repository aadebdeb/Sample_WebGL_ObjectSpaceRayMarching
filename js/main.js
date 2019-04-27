(function(){

  function createShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) + source);
    }
    return shader;
  }

  function createProgramFromSource(gl, vertexShaderSource, fragmentShaderSource) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, vertexShaderSource, gl.VERTEX_SHADER));
    gl.attachShader(program, createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  function getUniformLocations(gl, program, keys) {
    const locations = {};
    keys.forEach(key => {
        locations[key] = gl.getUniformLocation(program, key);
    });
    return locations;
  }

  const NOMRAL_VERTEX_SHADER_SOURCE =
`#version 300 es

layout (location = 0) in vec3 i_position;
layout (location = 1) in vec3 i_normal;

out vec3 v_normal;

uniform mat4 u_mvpMatrix;
uniform mat4 u_normalMatrix;

void main(void) {
  v_normal = (u_normalMatrix * vec4(i_normal, 0.0)).xyz;
  gl_Position = u_mvpMatrix * vec4(i_position, 1.0);
}
`;

  const NORMAL_FRAGMENT_SHADER_SOURCE =
`#version 300 es

precision highp float;

in vec3 v_normal;

out vec4 o_color;

void main(void) {
  o_color = vec4(v_normal * 0.5 + 0.5, 1.0);
}
`;

  const RAYMARCH_VERTEX_SHADER_SOURCE =
`#version 300 es

const vec3[8] CUBE_POSITIONS = vec3[](
  vec3(-1.0, -1.0,  1.0),
  vec3( 1.0, -1.0,  1.0),
  vec3( 1.0, -1.0, -1.0),
  vec3(-1.0, -1.0, -1.0),
  vec3(-1.0,  1.0,  1.0),
  vec3( 1.0,  1.0,  1.0),
  vec3( 1.0,  1.0, -1.0),
  vec3(-1.0,  1.0, -1.0)
);

const vec3[6] CUBE_NORMALS = vec3[](
  vec3(0.0, 0.0, 1.0),
  vec3(1.0, 0.0, 0.0),
  vec3(0.0, 0.0, -1.0),
  vec3(-1.0, 0.0, 0.0),
  vec3(0.0, 1.0, 0.0),
  vec3(0.0, -1.0, 0.0)
);

const int[36] CUBE_INDICES = int[](
  0, 5, 4, 0, 1, 5,
  1, 6, 5, 1, 2, 6,
  2, 7, 6, 2, 3, 7,
  3, 4, 7, 3, 0, 4,
  4, 6, 7, 4, 5, 6,
  3, 1, 0, 3, 2, 1
);

out vec3 v_position;
out vec3 v_normal;

uniform mat4 u_mvpMatrix;
uniform mat4 u_modelMatrix;
uniform vec3 u_scale;

void main(void) {
  vec3 position = u_scale * CUBE_POSITIONS[CUBE_INDICES[gl_VertexID]];
  vec3 normal = CUBE_NORMALS[gl_VertexID / 6];
  v_position = (u_modelMatrix * vec4(position, 1.0)).xyz;
  v_normal = (u_modelMatrix * vec4(normal, 0.0)).xyz;
  gl_Position = u_mvpMatrix * vec4(position, 1.0);
}

`;

  const RAYMARCH_FRAGMENT_SHADER_SOURCE =
`#version 300 es

precision highp float;

in vec3 v_position;
in vec3 v_normal;

out vec4 o_color;

uniform mat4 u_mvpMatrix;
uniform mat4 u_modelMatrix;
uniform mat4 u_invModelMatrix;
uniform vec3 u_scale;
uniform vec3 u_cameraPosition;

struct Ray {
  vec3 origin;
  vec3 dir;
};

Ray convertRayFromWorldToObject(Ray ray) {
  vec3 origin = (u_invModelMatrix * vec4(ray.origin, 1.0)).xyz;
  vec3 dir = normalize((u_invModelMatrix * vec4(ray.dir, 0.0)).xyz);
  return Ray(origin, dir);
}

void getRange(Ray ray, inout float tmin, inout float tmax) {
  for (int i = 0; i < 3; i++) {
    float t1 = (u_scale[i] - ray.origin[i]) / ray.dir[i];
    float t2 = (-u_scale[i] - ray.origin[i]) / ray.dir[i];
    tmin = max(tmin, min(t1, t2));
    tmax = min(tmax, max(t1, t2));
  }
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float map(vec3 p) {
  p = mod(p, 10.0) - 5.0;
  return sdSphere(p, 3.0);
}

vec3 getNormal(vec3 p) {
  float e = 0.01;
  return normalize(vec3(
    map(p + vec3(e, 0.0, 0.0)) - map(p - vec3(e, 0.0, 0.0)),
    map(p + vec3(0.0, e, 0.0)) - map(p - vec3(0.0, e, 0.0)),
    map(p + vec3(0.0, 0.0, e)) - map(p - vec3(0.0, 0.0, e))
  ));
}

bool raymarch(Ray ray, float tmin, float tmax, out float t) {
  t = tmin;
  vec3 p = ray.origin + t * ray.dir;
  for (int i = 0; i < 32; i++) {
    float d = max(0.0, map(p));
    t += d;
    if (t > tmax) {
      break;
    }
    p += d * ray.dir;
    if (d < 0.01) {
      return true;
    }
  }
  return false;
}

vec3 getColor(vec3 position, vec3 normal) {
  return normal * 0.5 + 0.5;
}

void main(void) {
  vec3 dir = normalize(v_position - u_cameraPosition);
  Ray ray = convertRayFromWorldToObject(Ray(u_cameraPosition, dir));
  float tmin = 0.0;
  float tmax = 1e16;
  getRange(ray, tmin, tmax);
  float t;
  if (raymarch(ray, tmin, tmax, t)) {
    vec3 position = ray.origin + t * ray.dir;
    vec3 color = getColor(
      (u_modelMatrix * vec4(position, 1.0)).xyz,
      t == tmin ? normalize(v_normal) : (u_modelMatrix * vec4(getNormal(position), 0.0)).xyz
    );
    o_color = vec4(color, 1.0);
    vec4 clipPos = u_mvpMatrix * vec4(position, 1.0);
    gl_FragDepth = (clipPos.z / clipPos.w) * 0.5 + 0.5;
  } else {
    discard;
  }
}
`;

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const parameters = {
    translation: { x: 0.0, y: 0.0, z: 0.0 },
    rotation: { x: 0.0, y: .0, z: 0.0 },
    scale: { x: 50.0, y: 50.0, z: 50.0},
  };

  const gui = new dat.GUI();
  const transFolder = gui.addFolder('translation');
  transFolder.add(parameters.translation, 'x', -100.0, 100.0).step(0.1);
  transFolder.add(parameters.translation, 'y', -100.0, 100.0).step(0.1);
  transFolder.add(parameters.translation, 'z', -100.0, 100.0).step(0.1);
  const rotFolder = gui.addFolder('rotation');
  rotFolder.add(parameters.rotation, 'x', -180.0, 180.0).step(0.1);
  rotFolder.add(parameters.rotation, 'y', -180.0, 180.0).step(0.1);
  rotFolder.add(parameters.rotation, 'z', -180.0, 180.0).step(0.1);
  const scaleFolder = gui.addFolder('scale');
  scaleFolder.add(parameters.scale, 'x', 0.0, 100.0).step(0.1);
  scaleFolder.add(parameters.scale, 'y', 0.0, 100.0).step(0.1);
  scaleFolder.add(parameters.scale, 'z', 0.0, 100.0).step(0.1);

  const canvas = document.getElementById('canvas');
  const resizeCanvas = function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const gl = canvas.getContext('webgl2');
  gl.clearColor(0.3, 0.3, 0.3, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  const normalProgram = createProgramFromSource(gl, NOMRAL_VERTEX_SHADER_SOURCE, NORMAL_FRAGMENT_SHADER_SOURCE);
  const normalUniforms = getUniformLocations(gl, normalProgram,
    ['u_mvpMatrix', 'u_normalMatrix']);

  const raymarchProgram = createProgramFromSource(gl, RAYMARCH_VERTEX_SHADER_SOURCE, RAYMARCH_FRAGMENT_SHADER_SOURCE);
  const raymarchUniforms = getUniformLocations(gl, raymarchProgram, 
    ['u_mvpMatrix', 'u_modelMatrix', 'u_invModelMatrix', 'u_scale', 'u_cameraPosition']);

  const sphere = createSphere(30.0, 16, 32);
  const sphereVao =createVao(gl, [
    { buffer: createVbo(gl, sphere.positions), index: 0, size: 3 },
    { buffer: createVbo(gl, sphere.normals), index: 1, size: 3 },
  ], createIbo(gl, sphere.indices));

  const cameraPosition = new Vector3(150.0, 150.0, 150.0);

  const renderSphere = function(vpMatrix) {
    gl.useProgram(normalProgram);
    gl.uniformMatrix4fv(normalUniforms['u_mvpMatrix'], false, vpMatrix.elements);
    gl.uniformMatrix4fv(normalUniforms['u_normalMatrix'], false, Matrix4.identity.elements);
    gl.bindVertexArray(sphereVao);
    gl.drawElements(gl.TRIANGLES, sphere.indices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  };

  const renderRaymarch = function(vpMatrix) {
    const DEGREE_TO_RADIAN = Math.PI / 180.0;

    const rotMatrix = Matrix4.rotateXYZ(
      DEGREE_TO_RADIAN * parameters.rotation.x,
      DEGREE_TO_RADIAN * parameters.rotation.y,
      DEGREE_TO_RADIAN * parameters.rotation.z
    );

    const modelMatrix = Matrix4.mul(rotMatrix, Matrix4.translate(parameters.translation.x, parameters.translation.y, parameters.translation.z));
    const invModelMatrix = Matrix4.inverse(modelMatrix);
    const mvpMatrix = Matrix4.mul(modelMatrix, vpMatrix);

    gl.useProgram(raymarchProgram);
    gl.uniformMatrix4fv(raymarchUniforms['u_mvpMatrix'], false, mvpMatrix.elements);
    gl.uniformMatrix4fv(raymarchUniforms['u_modelMatrix'], false, modelMatrix.elements);
    gl.uniformMatrix4fv(raymarchUniforms['u_invModelMatrix'], false, invModelMatrix.elements);
    gl.uniform3f(raymarchUniforms['u_scale'], parameters.scale.x, parameters.scale.y, parameters.scale.z);
    gl.uniform3f(raymarchUniforms['u_cameraPosition'], cameraPosition.x, cameraPosition.y, cameraPosition.z);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  };

  const viewMatrix = Matrix4.inverse(Matrix4.lookAt(
    cameraPosition,
    Vector3.zero,
    new Vector3(0.0, 1.0, 0.0)
  ));
  const render = function() {
    stats.update();

    const projectionMatrix = Matrix4.perspective(canvas.width / canvas.height, 60.0, 0.01, 1000.0);
    const vpMatrix = Matrix4.mul(viewMatrix, projectionMatrix);

    gl.viewport(0.0, 0.0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    renderSphere(vpMatrix);
    renderRaymarch(vpMatrix);

    requestAnimationFrame(render);
  };
  render();

}());