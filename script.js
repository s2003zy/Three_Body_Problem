import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
    let scene, camera, renderer;
    let bodies = [];
    let trails = [];
    const G = 9.8; // Gravitational constant - adjust for simulation speed/stability
    const default_mass = 300;
    const default_trail_length = 800;
    const default_speed_mutiplier = 12;
    let animationFrameId;

    function init() {
        // Scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x333333); // Dark grey background
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.z = 300;

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const pointLight = new THREE.PointLight(0xffffff, 1.5);
        pointLight.position.set(100, 100, 100);
        scene.add(pointLight);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;
        controls.screenSpacePanning = false;
        controls.maxPolarAngle = Math.PI / 2;

        // Event Listeners
        document.getElementById('startButton').addEventListener('click', startSimulation);
        document.getElementById('resetButton').addEventListener('click', resetSimulation);
        window.addEventListener('resize', onWindowResize, false);

        // Initial setup
        resetSimulation();
    }

    function startSimulation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        createBodiesFromControls();
        animate();
    }

    function createBodiesFromControls() {
        bodies.forEach(body => {
            scene.remove(body.mesh);
            if (body.trail) scene.remove(body.trail);
        });
        bodies = [];
        trails = [];

        const randomOffset = () => (Math.random() - 0.5) * 20;
        const randomSpeed = () => (Math.random() * default_speed_mutiplier + 0.5);
        const randomDirection = () => {
            const theta = Math.random() * Math.PI * 2; // 方位角
            const phi = Math.acos(Math.random() * 2 - 1); // 极角
            return {
                x: Math.sin(phi) * Math.cos(theta),
                y: Math.sin(phi) * Math.sin(theta),
                z: Math.cos(phi)
            };
        };

        for (let i = 1; i <= 3; i++) {
            const posX = parseFloat(document.getElementById(`b${i}-posX`).value) || (i === 1 ? -50 + randomOffset() : i === 2 ? 50 + randomOffset() : randomOffset());
            const posY = parseFloat(document.getElementById(`b${i}-posY`).value) || (i === 3 ? 50 + randomOffset() : randomOffset());
            const posZ = parseFloat(document.getElementById(`b${i}-posZ`).value) || randomOffset();
            const dir = randomDirection();
            const velX = parseFloat(document.getElementById(`b${i}-velX`).value) || dir.x * randomSpeed();
            const velY = parseFloat(document.getElementById(`b${i}-velY`).value) || dir.y * randomSpeed();
            const velZ = parseFloat(document.getElementById(`b${i}-velZ`).value) || dir.z * randomSpeed();
            const mass = parseFloat(document.getElementById(`b${i}-mass`).value) || default_mass;
            const radius = Math.cbrt(mass) * 2; // Radius proportional to cube root of mass

            const geometry = new THREE.SphereGeometry(radius, 32, 32);
            // Assign specific bright colors
            let sphereColor;
            if (i === 1) sphereColor = 0xff0000; // Red
            else if (i === 2) sphereColor = 0x00ff00; // Green
            else sphereColor = 0x0000ff; // Blue
            const material = new THREE.MeshPhongMaterial({ color: sphereColor });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(posX, posY, posZ);
            scene.add(mesh);

            // Trail setup
            const trailMaterial = new THREE.LineBasicMaterial({ color: material.color, linewidth: 2 });
            const trailGeometry = new THREE.BufferGeometry();
            const trailPositions = new Float32Array(default_trail_length * 3); // Max default_trail_length * 3 points
            trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            const trail = new THREE.Line(trailGeometry, trailMaterial);
            scene.add(trail);

            bodies.push({
                mesh: mesh,
                velocity: new THREE.Vector3(velX, velY, velZ),
                mass: mass,
                trail: trail,
                trailPoints: new Float32Array(default_trail_length * 3), // Stores the history of points
                trailIndex: 0, // Current index to write the new point in trailPoints
                trailPointsCount: 0 // Number of valid points in trailPoints
            });
        }
    }

    function updatePhysics() {
        const dt = 0.1; // Time step - adjust for simulation speed/stability

        // Calculate forces
        for (let i = 0; i < bodies.length; i++) {
            const bodyA = bodies[i];
            let totalForce = new THREE.Vector3(0, 0, 0);

            for (let j = 0; j < bodies.length; j++) {
                if (i === j) continue;
                const bodyB = bodies[j];

                const diff = new THREE.Vector3().subVectors(bodyB.mesh.position, bodyA.mesh.position);
                const distanceSq = diff.lengthSq();
                if (distanceSq < 1) continue; // Avoid division by zero or extreme forces at close range

                const forceMagnitude = (G * bodyA.mass * bodyB.mass) / distanceSq;
                const forceDirection = diff.normalize();
                totalForce.add(forceDirection.multiplyScalar(forceMagnitude));
            }

            // Update velocity (F = ma => a = F/m)
            const acceleration = totalForce.divideScalar(bodyA.mass);
            bodyA.velocity.add(acceleration.multiplyScalar(dt));
        }

        // Update positions
        bodies.forEach(body => {
            body.mesh.position.add(body.velocity.clone().multiplyScalar(dt));

            // Update trail
            // Store the new point in the circular buffer body.trailPoints
            body.trailPoints[body.trailIndex * 3] = body.mesh.position.x;
            body.trailPoints[body.trailIndex * 3 + 1] = body.mesh.position.y;
            body.trailPoints[body.trailIndex * 3 + 2] = body.mesh.position.z;
            
            body.trailIndex = (body.trailIndex + 1) % default_trail_length;
            if (body.trailPointsCount < default_trail_length) {
                body.trailPointsCount++;
            }

            const positionsAttribute = body.trail.geometry.attributes.position;
            const displayPositions = positionsAttribute.array;

            // Copy the trail points to the display buffer in the correct order for drawing
            for (let k = 0; k < body.trailPointsCount; k++) {
                let sourceIdx;
                if (body.trailPointsCount === default_trail_length) { // Buffer is full and wrapped around
                    sourceIdx = (body.trailIndex + k) % default_trail_length;
                } else { // Buffer is not full yet
                    sourceIdx = k; // Points are stored from 0 up to trailPointsCount - 1
                }
                displayPositions[k * 3]     = body.trailPoints[sourceIdx * 3];
                displayPositions[k * 3 + 1] = body.trailPoints[sourceIdx * 3 + 1];
                displayPositions[k * 3 + 2] = body.trailPoints[sourceIdx * 3 + 2];
            }
            
            positionsAttribute.needsUpdate = true;
            body.trail.geometry.setDrawRange(0, body.trailPointsCount); // Use the actual count
        });
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        if (bodies.length > 0) {
            updatePhysics();
        }
        renderer.render(scene, camera);
    }

    function resetSimulation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        // Reset to default values or clear
        // 添加随机因素并调整初始参数
        const randomOffset = () => (Math.random() - 0.5) * 20;
        const randomSpeed = () => (Math.random() * default_speed_mutiplier + 0.5);
        const randomDirection = () => {
            const theta = Math.random() * Math.PI * 2; // 方位角
            const phi = Math.acos(Math.random() * 2 - 1); // 极角
            return {
                x: Math.sin(phi) * Math.cos(theta),
                y: Math.sin(phi) * Math.sin(theta),
                z: Math.cos(phi)
            };
        };
        
        document.getElementById('b1-posX').value = -50 + randomOffset();
        document.getElementById('b1-posY').value = randomOffset();
        document.getElementById('b1-posZ').value = randomOffset();
        const dir1 = randomDirection();
        document.getElementById('b1-velX').value = dir1.x * randomSpeed();
        document.getElementById('b1-velY').value = dir1.y * randomSpeed();
        document.getElementById('b1-velZ').value = dir1.z * randomSpeed();
        document.getElementById('b1-mass').value = default_mass;

        document.getElementById('b2-posX').value = 50 + randomOffset();
        document.getElementById('b2-posY').value = randomOffset();
        document.getElementById('b2-posZ').value = randomOffset();
        const dir2 = randomDirection();
        document.getElementById('b2-velX').value = dir2.x * randomSpeed();
        document.getElementById('b2-velY').value = dir2.y * randomSpeed();
        document.getElementById('b2-velZ').value = dir2.z * randomSpeed();
        document.getElementById('b2-mass').value = default_mass;

        document.getElementById('b3-posX').value = randomOffset();
        document.getElementById('b3-posY').value = 50 + randomOffset();
        document.getElementById('b3-posZ').value = randomOffset();
        const dir3 = randomDirection();
        document.getElementById('b3-velX').value = dir3.x * randomSpeed();
        document.getElementById('b3-velY').value = dir3.y * randomSpeed();
        document.getElementById('b3-velZ').value = dir3.z * randomSpeed();
        document.getElementById('b3-mass').value = default_mass;

        createBodiesFromControls();
        animate();
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    init();
});