// Skateboard Simulator - Main Game File
// Using Three.js for 3D rendering with custom physics

// ==================== GAME CONFIGURATION ====================
const CONFIG = {
    // Physics
    gravity: -25,
    friction: 0.98,
    groundFriction: 0.995,
    airResistance: 0.999,
    pushForce: 8,
    turnSpeed: 2.5,
    maxSpeed: 35,
    jumpForce: 12,
    leanForwardMultiplier: 1.15,
    leanBackBrake: 0.97,

    // Grinding
    grindSnapDistance: 1.5,
    grindSpeed: 0.85,
    balanceSensitivity: 0.003,
    balanceDecay: 0.02,
    balanceThreshold: 0.7,

    // Camera
    cameraHeight: 1.6,
    cameraLookAhead: 3,
    cameraSmoothness: 0.1,

    // Level
    levelLength: 200,
    obstacleFrequency: 15,
    trackWidth: 12,

    // Scoring
    grindPointsPerSecond: 100,
    trickPoints: {
        ollie: 50,
        grindStart: 100,
        grindComplete: 200
    }
};

// ==================== GAME STATE ====================
const gameState = {
    running: false,
    paused: false,
    time: 0,
    score: 0,
    combo: 1,
    level: 1,

    // Skateboard state
    position: new THREE.Vector3(0, 0.15, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: 0,
    tilt: 0,

    // Physics state
    onGround: true,
    isGrinding: false,
    grindRail: null,
    grindProgress: 0,
    balance: 0,

    // Input state
    keys: {},
    mouseX: 0,
    mouseDeltaX: 0,

    // Animation
    pushAnimation: 0,
    leanAmount: 0
};

// ==================== THREE.JS SETUP ====================
let scene, camera, renderer;
let skateboard, skateboardGroup;
let levelObjects = [];
let obstacles = [];
let rails = [];
let finishLine;

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    // Camera (first person)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, CONFIG.cameraHeight, 0);

    // Renderer
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);

    // Handle resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ==================== SKATEBOARD CREATION ====================
function createSkateboard() {
    skateboardGroup = new THREE.Group();

    // Deck
    const deckGeometry = new THREE.BoxGeometry(0.22, 0.03, 0.8);
    const deckMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.8
    });
    const deck = new THREE.Mesh(deckGeometry, deckMaterial);
    deck.position.y = 0.08;
    deck.castShadow = true;
    skateboardGroup.add(deck);

    // Grip tape (top of deck)
    const gripGeometry = new THREE.BoxGeometry(0.21, 0.005, 0.78);
    const gripMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 1
    });
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.y = 0.095;
    skateboardGroup.add(grip);

    // Trucks
    const truckGeometry = new THREE.BoxGeometry(0.25, 0.02, 0.05);
    const truckMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.8
    });

    const frontTruck = new THREE.Mesh(truckGeometry, truckMaterial);
    frontTruck.position.set(0, 0.05, 0.25);
    frontTruck.castShadow = true;
    skateboardGroup.add(frontTruck);

    const backTruck = new THREE.Mesh(truckGeometry, truckMaterial);
    backTruck.position.set(0, 0.05, -0.25);
    backTruck.castShadow = true;
    skateboardGroup.add(backTruck);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.025, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.3
    });

    const wheelPositions = [
        [-0.11, 0.03, 0.25],
        [0.11, 0.03, 0.25],
        [-0.11, 0.03, -0.25],
        [0.11, 0.03, -0.25]
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.castShadow = true;
        skateboardGroup.add(wheel);
    });

    skateboard = skateboardGroup;
    scene.add(skateboardGroup);
}

// ==================== LEVEL GENERATION ====================
function generateLevel() {
    // Clear previous level
    levelObjects.forEach(obj => scene.remove(obj));
    obstacles.forEach(obj => scene.remove(obj));
    rails.forEach(obj => scene.remove(obj));
    levelObjects = [];
    obstacles = [];
    rails = [];

    const levelLength = CONFIG.levelLength + (gameState.level - 1) * 50;

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(CONFIG.trackWidth * 2, levelLength + 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -levelLength / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    levelObjects.push(ground);

    // Sidewalk texture pattern
    const sidewalkGeometry = new THREE.PlaneGeometry(3, levelLength + 50);
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        roughness: 0.8
    });

    [-CONFIG.trackWidth + 1.5, CONFIG.trackWidth - 1.5].forEach(x => {
        const sidewalk = new THREE.Mesh(sidewalkGeometry, sidewalkMaterial);
        sidewalk.rotation.x = -Math.PI / 2;
        sidewalk.position.set(x, 0.01, -levelLength / 2);
        sidewalk.receiveShadow = true;
        scene.add(sidewalk);
        levelObjects.push(sidewalk);
    });

    // Generate obstacles
    const obstacleTypes = ['ramp', 'box', 'rail', 'funbox', 'pyramid', 'gap'];
    let lastZ = -15;

    for (let i = 0; i < Math.floor(levelLength / CONFIG.obstacleFrequency); i++) {
        const z = lastZ - CONFIG.obstacleFrequency - Math.random() * 10;
        const x = (Math.random() - 0.5) * (CONFIG.trackWidth - 4);
        const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];

        createObstacle(type, x, z);
        lastZ = z;
    }

    // Finish line
    const finishGeometry = new THREE.PlaneGeometry(CONFIG.trackWidth * 2, 2);
    const finishMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5
    });
    finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.02, -levelLength);
    scene.add(finishLine);
    levelObjects.push(finishLine);

    // Finish arch
    const archGeometry = new THREE.BoxGeometry(CONFIG.trackWidth * 2, 4, 0.3);
    const archMaterial = new THREE.MeshStandardMaterial({ color: 0x00aa00 });
    const arch = new THREE.Mesh(archGeometry, archMaterial);
    arch.position.set(0, 2, -levelLength);
    scene.add(arch);
    levelObjects.push(arch);

    // "FINISH" text on arch
    const textGeometry = new THREE.BoxGeometry(6, 1, 0.1);
    const textMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const finishText = new THREE.Mesh(textGeometry, textMaterial);
    finishText.position.set(0, 2.5, -levelLength + 0.2);
    scene.add(finishText);
    levelObjects.push(finishText);

    // Decorative elements (buildings on sides)
    for (let z = -10; z > -levelLength - 20; z -= 20) {
        [-CONFIG.trackWidth - 5, CONFIG.trackWidth + 5].forEach(x => {
            const height = 10 + Math.random() * 20;
            const buildingGeometry = new THREE.BoxGeometry(8, height, 15);
            const buildingMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0, 0, 0.3 + Math.random() * 0.3)
            });
            const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
            building.position.set(x, height / 2, z);
            building.castShadow = true;
            building.receiveShadow = true;
            scene.add(building);
            levelObjects.push(building);
        });
    }
}

function createObstacle(type, x, z) {
    const obstacleColor = 0x444444;
    const railColor = 0xcccccc;

    switch(type) {
        case 'ramp': {
            // Quarter pipe ramp
            const rampGroup = new THREE.Group();

            // Ramp surface using curved geometry
            const rampWidth = 3;
            const rampHeight = 1.2;
            const rampDepth = 2;

            // Simple wedge for now
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(rampDepth, 0);
            shape.lineTo(rampDepth, 0.1);
            shape.quadraticCurveTo(rampDepth * 0.5, rampHeight, 0, rampHeight);
            shape.lineTo(0, 0);

            const extrudeSettings = { depth: rampWidth, bevelEnabled: false };
            const rampGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const rampMaterial = new THREE.MeshStandardMaterial({
                color: 0x8B4513,
                roughness: 0.7
            });
            const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
            ramp.rotation.y = Math.PI / 2;
            ramp.position.set(x - rampWidth/2, 0, z);
            ramp.castShadow = true;
            ramp.receiveShadow = true;
            scene.add(ramp);

            obstacles.push({
                mesh: ramp,
                type: 'ramp',
                bounds: {
                    minX: x - rampWidth/2 - 0.5,
                    maxX: x + rampWidth/2 + 0.5,
                    minZ: z - rampDepth - 0.5,
                    maxZ: z + 0.5,
                    height: rampHeight
                }
            });
            break;
        }

        case 'box': {
            // Grindable box/ledge
            const boxWidth = 2 + Math.random() * 2;
            const boxHeight = 0.4 + Math.random() * 0.3;
            const boxDepth = 3 + Math.random() * 2;

            const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
            const boxMaterial = new THREE.MeshStandardMaterial({
                color: obstacleColor,
                roughness: 0.8
            });
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(x, boxHeight / 2, z);
            box.castShadow = true;
            box.receiveShadow = true;
            scene.add(box);

            // Metal edge (grindable)
            const edgeGeometry = new THREE.BoxGeometry(boxWidth + 0.05, 0.05, 0.05);
            const edgeMaterial = new THREE.MeshStandardMaterial({
                color: railColor,
                metalness: 0.9,
                roughness: 0.2
            });
            const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
            edge.position.set(x, boxHeight + 0.025, z + boxDepth/2);
            scene.add(edge);

            obstacles.push({
                mesh: box,
                type: 'box',
                bounds: {
                    minX: x - boxWidth/2,
                    maxX: x + boxWidth/2,
                    minZ: z - boxDepth/2,
                    maxZ: z + boxDepth/2,
                    height: boxHeight
                }
            });

            // Add grindable rail on top edge
            rails.push({
                mesh: edge,
                start: new THREE.Vector3(x - boxWidth/2, boxHeight + 0.05, z + boxDepth/2),
                end: new THREE.Vector3(x + boxWidth/2, boxHeight + 0.05, z + boxDepth/2),
                direction: new THREE.Vector3(1, 0, 0).normalize()
            });
            break;
        }

        case 'rail': {
            // Standalone rail
            const railLength = 4 + Math.random() * 4;
            const railHeight = 0.5 + Math.random() * 0.3;

            // Support posts
            const postGeometry = new THREE.BoxGeometry(0.1, railHeight, 0.1);
            const postMaterial = new THREE.MeshStandardMaterial({ color: obstacleColor });

            const post1 = new THREE.Mesh(postGeometry, postMaterial);
            post1.position.set(x, railHeight/2, z - railLength/2 + 0.2);
            post1.castShadow = true;
            scene.add(post1);
            levelObjects.push(post1);

            const post2 = new THREE.Mesh(postGeometry, postMaterial);
            post2.position.set(x, railHeight/2, z + railLength/2 - 0.2);
            post2.castShadow = true;
            scene.add(post2);
            levelObjects.push(post2);

            // Rail bar
            const railGeometry = new THREE.CylinderGeometry(0.04, 0.04, railLength, 8);
            const railMaterial = new THREE.MeshStandardMaterial({
                color: railColor,
                metalness: 0.9,
                roughness: 0.1
            });
            const rail = new THREE.Mesh(railGeometry, railMaterial);
            rail.rotation.x = Math.PI / 2;
            rail.position.set(x, railHeight, z);
            rail.castShadow = true;
            scene.add(rail);

            rails.push({
                mesh: rail,
                start: new THREE.Vector3(x, railHeight, z + railLength/2),
                end: new THREE.Vector3(x, railHeight, z - railLength/2),
                direction: new THREE.Vector3(0, 0, -1)
            });
            break;
        }

        case 'funbox': {
            // Funbox (box with ramps on sides)
            const boxWidth = 3;
            const boxHeight = 0.6;
            const boxDepth = 4;

            // Main box
            const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth - 1);
            const boxMaterial = new THREE.MeshStandardMaterial({
                color: 0x666666,
                roughness: 0.7
            });
            const box = new THREE.Mesh(boxGeometry, boxMaterial);
            box.position.set(x, boxHeight / 2, z);
            box.castShadow = true;
            box.receiveShadow = true;
            scene.add(box);

            obstacles.push({
                mesh: box,
                type: 'funbox',
                bounds: {
                    minX: x - boxWidth/2,
                    maxX: x + boxWidth/2,
                    minZ: z - boxDepth/2,
                    maxZ: z + boxDepth/2,
                    height: boxHeight
                }
            });

            // Add rail on top
            const railGeometry = new THREE.CylinderGeometry(0.04, 0.04, boxWidth, 8);
            const railMaterial = new THREE.MeshStandardMaterial({
                color: railColor,
                metalness: 0.9,
                roughness: 0.1
            });
            const rail = new THREE.Mesh(railGeometry, railMaterial);
            rail.rotation.z = Math.PI / 2;
            rail.position.set(x, boxHeight + 0.04, z);
            rail.castShadow = true;
            scene.add(rail);

            rails.push({
                mesh: rail,
                start: new THREE.Vector3(x - boxWidth/2, boxHeight + 0.04, z),
                end: new THREE.Vector3(x + boxWidth/2, boxHeight + 0.04, z),
                direction: new THREE.Vector3(1, 0, 0)
            });
            break;
        }

        case 'pyramid': {
            // Pyramid obstacle
            const pyramidSize = 2;
            const pyramidHeight = 0.8;

            const pyramidGeometry = new THREE.ConeGeometry(pyramidSize, pyramidHeight, 4);
            const pyramidMaterial = new THREE.MeshStandardMaterial({
                color: 0x555555,
                roughness: 0.8
            });
            const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
            pyramid.rotation.y = Math.PI / 4;
            pyramid.position.set(x, pyramidHeight / 2, z);
            pyramid.castShadow = true;
            pyramid.receiveShadow = true;
            scene.add(pyramid);

            obstacles.push({
                mesh: pyramid,
                type: 'pyramid',
                bounds: {
                    minX: x - pyramidSize,
                    maxX: x + pyramidSize,
                    minZ: z - pyramidSize,
                    maxZ: z + pyramidSize,
                    height: pyramidHeight
                },
                isSloped: true
            });
            break;
        }

        case 'gap': {
            // Gap to jump over
            const gapWidth = 4;
            const gapDepth = 2 + Math.random() * 2;
            const pitDepth = 0.5;

            const pitGeometry = new THREE.BoxGeometry(gapWidth, pitDepth, gapDepth);
            const pitMaterial = new THREE.MeshStandardMaterial({
                color: 0x222222
            });
            const pit = new THREE.Mesh(pitGeometry, pitMaterial);
            pit.position.set(x, -pitDepth / 2, z);
            scene.add(pit);
            levelObjects.push(pit);

            // Warning stripes
            const stripeGeometry = new THREE.PlaneGeometry(gapWidth, 0.5);
            const stripeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffff00
            });

            const stripe1 = new THREE.Mesh(stripeGeometry, stripeMaterial);
            stripe1.rotation.x = -Math.PI / 2;
            stripe1.position.set(x, 0.01, z + gapDepth/2 + 0.5);
            scene.add(stripe1);
            levelObjects.push(stripe1);

            obstacles.push({
                mesh: pit,
                type: 'gap',
                bounds: {
                    minX: x - gapWidth/2,
                    maxX: x + gapWidth/2,
                    minZ: z - gapDepth/2,
                    maxZ: z + gapDepth/2,
                    height: -pitDepth
                },
                isGap: true
            });
            break;
        }
    }
}

// ==================== INPUT HANDLING ====================
function initControls() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
        gameState.keys[e.code] = true;

        // Prevent default for game keys
        if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', (e) => {
        gameState.keys[e.code] = false;
    });

    // Mouse for balance control
    document.addEventListener('mousemove', (e) => {
        if (gameState.running && gameState.isGrinding) {
            const centerX = window.innerWidth / 2;
            gameState.mouseDeltaX = (e.clientX - centerX) / centerX;
        }
    });

    // Lock pointer during game
    document.addEventListener('click', () => {
        if (gameState.running && !gameState.isGrinding) {
            document.body.requestPointerLock?.();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        // Handle pointer lock change if needed
    });
}

// ==================== PHYSICS ====================
function updatePhysics(deltaTime) {
    if (!gameState.running || gameState.paused) return;

    const keys = gameState.keys;

    // Store previous position for collision
    const prevPosition = gameState.position.clone();

    if (gameState.isGrinding) {
        updateGrinding(deltaTime);
    } else {
        // Normal skateboard physics

        // Push (W key)
        if (keys['KeyW'] && gameState.onGround) {
            const pushDir = new THREE.Vector3(
                Math.sin(gameState.rotation),
                0,
                -Math.cos(gameState.rotation)
            );
            gameState.velocity.add(pushDir.multiplyScalar(CONFIG.pushForce * deltaTime));
            gameState.pushAnimation = Math.min(gameState.pushAnimation + deltaTime * 5, 1);
        } else {
            gameState.pushAnimation = Math.max(gameState.pushAnimation - deltaTime * 3, 0);
        }

        // Lean forward (Shift) - increases speed
        if (keys['ShiftLeft'] || keys['ShiftRight']) {
            gameState.leanAmount = Math.min(gameState.leanAmount + deltaTime * 3, 1);
            if (gameState.onGround) {
                const speed = gameState.velocity.length();
                if (speed > 0.1) {
                    gameState.velocity.multiplyScalar(CONFIG.leanForwardMultiplier);
                }
            }
        } else {
            gameState.leanAmount = Math.max(gameState.leanAmount - deltaTime * 3, 0);
        }

        // Lean back (S) - braking
        if (keys['KeyS'] && gameState.onGround) {
            gameState.velocity.multiplyScalar(CONFIG.leanBackBrake);
            gameState.leanAmount = Math.max(gameState.leanAmount - deltaTime * 2, -0.5);
        }

        // Turning (A/D)
        const currentSpeed = gameState.velocity.length();
        const turnMultiplier = Math.min(currentSpeed / 10, 1);

        if (keys['KeyA']) {
            gameState.rotation += CONFIG.turnSpeed * deltaTime * turnMultiplier;
        }
        if (keys['KeyD']) {
            gameState.rotation -= CONFIG.turnSpeed * deltaTime * turnMultiplier;
        }

        // Jump (Space)
        if (keys['Space'] && gameState.onGround) {
            gameState.velocity.y = CONFIG.jumpForce;
            gameState.onGround = false;
            addScore(CONFIG.trickPoints.ollie);
            showTrickNotification('OLLIE!');
        }

        // Apply gravity
        if (!gameState.onGround) {
            gameState.velocity.y += CONFIG.gravity * deltaTime;
        }

        // Apply friction
        if (gameState.onGround) {
            gameState.velocity.x *= CONFIG.groundFriction;
            gameState.velocity.z *= CONFIG.groundFriction;
        } else {
            gameState.velocity.x *= CONFIG.airResistance;
            gameState.velocity.z *= CONFIG.airResistance;
        }

        // Align velocity to board direction when on ground
        if (gameState.onGround && currentSpeed > 0.5) {
            const boardDir = new THREE.Vector3(
                Math.sin(gameState.rotation),
                0,
                -Math.cos(gameState.rotation)
            );
            const forwardVel = boardDir.multiplyScalar(
                gameState.velocity.dot(boardDir)
            );
            gameState.velocity.x = THREE.MathUtils.lerp(
                gameState.velocity.x,
                forwardVel.x,
                0.1
            );
            gameState.velocity.z = THREE.MathUtils.lerp(
                gameState.velocity.z,
                forwardVel.z,
                0.1
            );
        }

        // Clamp max speed
        const horizontalSpeed = Math.sqrt(
            gameState.velocity.x ** 2 + gameState.velocity.z ** 2
        );
        if (horizontalSpeed > CONFIG.maxSpeed) {
            const scale = CONFIG.maxSpeed / horizontalSpeed;
            gameState.velocity.x *= scale;
            gameState.velocity.z *= scale;
        }

        // Update position
        gameState.position.add(
            gameState.velocity.clone().multiplyScalar(deltaTime)
        );

        // Ground collision
        if (gameState.position.y <= 0.15) {
            gameState.position.y = 0.15;
            gameState.velocity.y = 0;
            gameState.onGround = true;
        }

        // Check for rail grinding
        checkRailGrind();

        // Check obstacle collisions
        checkObstacleCollisions(prevPosition);
    }

    // Boundary check
    if (Math.abs(gameState.position.x) > CONFIG.trackWidth) {
        gameState.position.x = Math.sign(gameState.position.x) * CONFIG.trackWidth;
        gameState.velocity.x *= -0.5;
    }

    // Check finish line
    const levelLength = CONFIG.levelLength + (gameState.level - 1) * 50;
    if (gameState.position.z < -levelLength) {
        levelComplete();
    }
}

function checkRailGrind() {
    if (gameState.isGrinding || gameState.onGround) return;

    for (const rail of rails) {
        // Check if we're close to the rail
        const railCenter = rail.start.clone().add(rail.end).multiplyScalar(0.5);
        const toRail = railCenter.clone().sub(gameState.position);

        // Check horizontal and vertical distance
        const horizontalDist = Math.sqrt(toRail.x ** 2 + toRail.z ** 2);
        const verticalDist = Math.abs(toRail.y);

        if (horizontalDist < CONFIG.grindSnapDistance &&
            verticalDist < 0.5 &&
            gameState.velocity.y < 0) {

            // Start grinding!
            startGrind(rail);
            break;
        }
    }
}

function startGrind(rail) {
    gameState.isGrinding = true;
    gameState.grindRail = rail;
    gameState.balance = 0;
    gameState.grindProgress = 0;

    // Snap to rail
    const railStart = rail.start;
    gameState.position.y = railStart.y + 0.1;

    // Show balance UI
    document.getElementById('balance-container').classList.remove('hidden');

    addScore(CONFIG.trickPoints.grindStart);
    showTrickNotification('GRIND!');

    // Increase combo
    gameState.combo++;
    updateComboDisplay();
}

function updateGrinding(deltaTime) {
    const rail = gameState.grindRail;
    if (!rail) return;

    // Balance mechanics
    gameState.balance += gameState.mouseDeltaX * CONFIG.balanceSensitivity;
    gameState.balance += (Math.random() - 0.5) * CONFIG.balanceDecay;

    // Update balance indicator
    const indicator = document.getElementById('balance-indicator');
    const balancePercent = 50 + gameState.balance * 50;
    indicator.style.left = `${Math.max(0, Math.min(100, balancePercent))}%`;

    // Check if fell off
    if (Math.abs(gameState.balance) > CONFIG.balanceThreshold) {
        endGrind(false);
        return;
    }

    // Move along rail
    const grindSpeed = gameState.velocity.length() * CONFIG.grindSpeed;
    gameState.grindProgress += grindSpeed * deltaTime;

    // Calculate position along rail
    const railLength = rail.start.distanceTo(rail.end);
    const t = Math.min(gameState.grindProgress / railLength, 1);

    const newPos = rail.start.clone().lerp(rail.end, t);
    gameState.position.x = newPos.x;
    gameState.position.z = newPos.z;
    gameState.position.y = newPos.y + 0.1;

    // Align rotation to rail direction
    gameState.rotation = Math.atan2(rail.direction.x, -rail.direction.z);

    // Add score for grinding
    addScore(CONFIG.grindPointsPerSecond * deltaTime * gameState.combo);

    // Check if reached end of rail
    if (t >= 1) {
        endGrind(true);
    }

    // Allow jumping off rail
    if (gameState.keys['Space']) {
        gameState.velocity.y = CONFIG.jumpForce * 0.8;
        endGrind(true);
    }
}

function endGrind(success) {
    gameState.isGrinding = false;
    gameState.grindRail = null;
    gameState.onGround = false;

    // Hide balance UI
    document.getElementById('balance-container').classList.add('hidden');

    if (success) {
        addScore(CONFIG.trickPoints.grindComplete * gameState.combo);
        showTrickNotification(`GRIND COMPLETE! x${gameState.combo}`);
    } else {
        // Crash!
        crash();
    }
}

function checkObstacleCollisions(prevPosition) {
    for (const obstacle of obstacles) {
        const bounds = obstacle.bounds;
        const pos = gameState.position;

        // Check if inside obstacle bounds
        if (pos.x > bounds.minX && pos.x < bounds.maxX &&
            pos.z > bounds.minZ && pos.z < bounds.maxZ) {

            if (obstacle.isGap) {
                // Fell into gap
                if (pos.y < 0.2) {
                    crash();
                    return;
                }
            } else if (obstacle.isSloped) {
                // Sloped surface - adjust height
                const centerX = (bounds.minX + bounds.maxX) / 2;
                const centerZ = (bounds.minZ + bounds.maxZ) / 2;
                const distFromCenter = Math.sqrt(
                    (pos.x - centerX) ** 2 + (pos.z - centerZ) ** 2
                );
                const maxDist = (bounds.maxX - bounds.minX) / 2;
                const heightAtPos = bounds.height * (1 - distFromCenter / maxDist);

                if (pos.y < heightAtPos + 0.15) {
                    pos.y = heightAtPos + 0.15;
                    gameState.onGround = true;
                    gameState.velocity.y = 0;
                }
            } else {
                // Solid obstacle
                if (pos.y < bounds.height + 0.15) {
                    // Check if approaching from above (landing on top)
                    if (prevPosition.y > bounds.height + 0.1 && gameState.velocity.y < 0) {
                        pos.y = bounds.height + 0.15;
                        gameState.onGround = true;
                        gameState.velocity.y = 0;
                    } else {
                        // Side collision - push back
                        const pushBackX = pos.x - (bounds.minX + bounds.maxX) / 2;
                        const pushBackZ = pos.z - (bounds.minZ + bounds.maxZ) / 2;

                        if (Math.abs(pushBackX) > Math.abs(pushBackZ)) {
                            pos.x = pushBackX > 0 ? bounds.maxX + 0.2 : bounds.minX - 0.2;
                            gameState.velocity.x *= -0.3;
                        } else {
                            pos.z = pushBackZ > 0 ? bounds.maxZ + 0.2 : bounds.minZ - 0.2;
                            gameState.velocity.z *= -0.3;
                        }

                        // High speed collision = crash
                        if (gameState.velocity.length() > 10) {
                            crash();
                            return;
                        }
                    }
                }
            }
        }
    }
}

function crash() {
    gameState.running = false;
    gameState.combo = 1;
    document.getElementById('crash-screen').classList.remove('hidden');
    document.getElementById('balance-container').classList.add('hidden');
}

// ==================== CAMERA ====================
function updateCamera() {
    if (!gameState.running) return;

    // First person view from skater's perspective
    const targetPos = new THREE.Vector3(
        gameState.position.x,
        gameState.position.y + CONFIG.cameraHeight,
        gameState.position.z
    );

    camera.position.lerp(targetPos, CONFIG.cameraSmoothness);

    // Look direction based on board rotation and lean
    const lookAhead = new THREE.Vector3(
        Math.sin(gameState.rotation) * CONFIG.cameraLookAhead,
        -gameState.leanAmount * 0.5,
        -Math.cos(gameState.rotation) * CONFIG.cameraLookAhead
    );

    const lookTarget = camera.position.clone().add(lookAhead);
    camera.lookAt(lookTarget);

    // Add slight tilt based on turning
    const turnInput = (gameState.keys['KeyA'] ? 1 : 0) - (gameState.keys['KeyD'] ? 1 : 0);
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, turnInput * 0.1, 0.1);
}

// ==================== SKATEBOARD VISUAL UPDATE ====================
function updateSkateboard() {
    if (!skateboard) return;

    skateboard.position.copy(gameState.position);
    skateboard.rotation.y = gameState.rotation;

    // Tilt based on lean
    skateboard.rotation.x = gameState.leanAmount * 0.3;

    // Balance wobble during grind
    if (gameState.isGrinding) {
        skateboard.rotation.z = gameState.balance * 0.5;
    } else {
        skateboard.rotation.z = 0;
    }
}

// ==================== UI UPDATES ====================
function updateUI() {
    // Timer
    const minutes = Math.floor(gameState.time / 60);
    const seconds = Math.floor(gameState.time % 60);
    document.getElementById('timer').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Score
    document.getElementById('score').textContent = `Score: ${Math.floor(gameState.score)}`;

    // Speed
    const speedKmh = Math.round(gameState.velocity.length() * 3.6);
    document.getElementById('speed').textContent = `Speed: ${speedKmh} km/h`;
}

function updateComboDisplay() {
    const comboEl = document.getElementById('combo');
    if (gameState.combo > 1) {
        comboEl.classList.remove('hidden');
        comboEl.textContent = `Combo x${gameState.combo}`;
    } else {
        comboEl.classList.add('hidden');
    }
}

function addScore(points) {
    gameState.score += points * gameState.combo;
}

function showTrickNotification(text) {
    const notification = document.createElement('div');
    notification.className = 'trick-notification';
    notification.textContent = text;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 1000);
}

function levelComplete() {
    gameState.running = false;

    document.getElementById('final-time').textContent =
        `Time: ${document.getElementById('timer').textContent}`;
    document.getElementById('final-score').textContent =
        `Score: ${Math.floor(gameState.score)}`;
    document.getElementById('gameover-screen').classList.remove('hidden');
}

// ==================== GAME LOOP ====================
let lastTime = 0;

function gameLoop(timestamp) {
    const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (gameState.running) {
        gameState.time += deltaTime;
        updatePhysics(deltaTime);
        updateCamera();
        updateSkateboard();
        updateUI();
    }

    renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// ==================== GAME CONTROL ====================
function startGame() {
    // Reset state
    gameState.running = true;
    gameState.paused = false;
    gameState.time = 0;
    gameState.score = 0;
    gameState.combo = 1;
    gameState.position.set(0, 0.15, 0);
    gameState.velocity.set(0, 0, 0);
    gameState.rotation = 0;
    gameState.tilt = 0;
    gameState.onGround = true;
    gameState.isGrinding = false;
    gameState.balance = 0;
    gameState.leanAmount = 0;

    // Hide screens
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('crash-screen').classList.add('hidden');
    document.getElementById('balance-container').classList.add('hidden');

    updateComboDisplay();
    generateLevel();
}

function nextLevel() {
    gameState.level++;
    startGame();
}

function retry() {
    startGame();
}

// ==================== INITIALIZATION ====================
function init() {
    initThreeJS();
    createSkateboard();
    initControls();
    generateLevel();

    // UI event listeners
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('restart-btn').addEventListener('click', nextLevel);
    document.getElementById('retry-btn').addEventListener('click', retry);

    // Start game loop
    requestAnimationFrame(gameLoop);
}

// Start when page loads
window.addEventListener('load', init);
