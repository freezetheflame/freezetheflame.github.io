---
title: Moer框架解析与材质实现
date: 2024-04-18
tags: [CG, C++]
---

\n

Moer的框架很大，其中包含必要的多种工具链，除了渲染的多层之外的依赖全都放在ext中，包含FastMath（数学库很显然）、json（JSON化数据交换格式库）、nanovdb（稀释体积数据处理工具）、pcg（随机数生成库与工具）、stb（加载或者解码不同格式的图片）

\n\n\n\n

由于学长希望我去做的是layered material的材质，所以这些工具链我暂时不用过度深究，跟着其他材料照猫画虎即可，关键的渲染实现部分代码放在src文件夹中，并且按照功能分成了CoreLayer,FunctionLayer,ResourceLayer三层，我接下来会仔细进行阐述和举例解析：

\n\n\n\n

## CoreLayer

\n\n\n\n

├─Adapter  
│ JsonUtil.cpp  
│ JsonUtil.h  
│ Random.h  
│  
├─ColorSpace  
│ Color.h  
│ RGB3.cpp  
│ Spectrum.cpp  
│ XYZ3.cpp  
│  
├─Geometry  
│ Angle.cpp  
│ Angle.h  
│ BoundingBox.cpp  
│ BoundingBox.h  
│ Frame.h  
│ Geometry.h  
│ Matrix.cpp  
│ Matrix.h  
│ Normal.h  
│ Point.h  
│ Transform3d.cpp  
│ Transform3d.h  
│ Vector.h  
│  
├─Math  
│ Common.h  
│ LowDiscrepancy.cpp  
│ LowDiscrepancy.h  
│ Warp.h  
│  
└─Ray  
Ray.cpp  
Ray.h

\n\n\n\n

CoreLayer的内容主要为五部分：Adapter,ColorSpace,Geometry,Math&Ray 这五块部分共同组成了图形学组装基本元素的基础，其实也不能这么讲，我们通过Adapter来处理建模参数，处理数据问题；使用ColorSpace来切换常用的颜色空间；Geometry用来存储、计算基本的几何结构以及相关数据；Math库来做一些复杂向量、矩阵以及数值求和等的精确或者简化计算；Ray则是存储光的几何结构，按照目前的实现来看没有过度考究“波动性”一类的微观特征（偏物理，也是最近几年才有比较多发展的工作）

\n\n\n\n

### Adapter

\n\n\n\n

//TODO

\n\n\n\n

### ColorSpace

\n\n\n\n

//TODO

\n\n\n\n

### Geometry

\n\n\n\n

//TODO

\n\n\n\n

### Math

\n\n\n\n

//TODO

\n\n\n\n

### Ray

\n\n\n\n

//TODO

\n\n\n\n

## FunctionLayer

\n\n\n\nfolder structure\n

│ Intersection.h  
│  
├─Acceleration  
│ Accel.h  
│ Bvh.cpp  
│ Bvh.h  
│ Embree.cpp  
│ Embree.h  
│  
├─Camera  
│ Camera.h  
│ CameraFactory.cpp  
│ CameraFactory.h  
│ DifferentialPinhole.cpp  
│ DifferentialPinhole.h  
│ Perspective.h  
│ Pinhole.cpp  
│ Pinhole.h  
│ Thinlens.cpp  
│ Thinlens.h  
│  
├─Distribution  
│ Distribution.cpp  
│ Distribution.h  
│  
├─Film  
│ Film.cpp  
│ Film.h  
│ ToneMapping.h  
│  
├─Filter  
│ Filter.h  
│  
├─Integrator  
│ │ AbstractPathIntegrator.cpp  
│ │ AbstractPathIntegrator.h  
│ │ GuidedPathIntegrator.cpp  
│ │ GuidedPathIntegrator.h  
│ │ Integrator.cpp  
│ │ Integrator.h  
│ │ MonteCarloIntegrator.cpp  
│ │ MonteCarloIntegrator.h  
│ │ NormalIntegrator.cpp  
│ │ NormalIntegrator.h  
│ │ PathIntegrator-new.cpp  
│ │ PathIntegrator-new.h  
│ │ PathIntegrator.cpp  
│ │ PathIntegrator.h  
│ │ VolPathIntegrator.cpp  
│ │ VolPathIntegrator.h  
│ │  
│ └─guiding  
│ AdaptiveKDTree.h  
│ data.h  
│ GuidedBxDF.h  
│ guiding.h  
│ vmm.h  
│  
├─Light  
│ AreaLight.cpp  
│ AreaLight.h  
│ DiffuseAreaLight.cpp  
│ DiffuseAreaLight.h  
│ InfiniteSphereCapLight.cpp  
│ InfiniteSphereCapLight.h  
│ InfiniteSphereLight.cpp  
│ InfiniteSphereLight.h  
│ Light.h  
│ PointLight.cpp  
│ PointLight.h  
│  
├─Material  
│ │ BumpMapMateiral.cpp  
│ │ BumpMapMaterial.h  
│ │ ConductorMaterial.cpp  
│ │ ConductorMaterial.h  
│ │ DielectricMaterial.cpp  
│ │ DielectricMaterial.h  
│ │ DisneyBSDF.cpp  
│ │ DisneyBSDF.h  
│ │ HairMaterial.cpp  
│ │ HairMaterial.h  
│ │ LayeredMaterial.cpp  
│ │ LayeredMaterial.h  
│ │ Material.cpp  
│ │ Material.h  
│ │ MaterialFactory.cpp  
│ │ MaterialFactory.h  
│ │ MatteMaterial.cpp  
│ │ MatteMaterial.h  
│ │ MirrorMaterial.cpp  
│ │ MirrorMaterial.h  
│ │ NormalMapMaterial.cpp  
│ │ NormalMapMaterial.h  
│ │ NullMaterial.cpp  
│ │ NullMaterial.h  
│ │ PlasticMaterial.cpp  
│ │ PlasticMaterial.h  
│ │  
│ ├─BSSRDF  
│ │ BSSRDF.h  
│ │  
│ └─BxDF  
│ BxDF.h  
│ ComplexIor.cpp  
│ ComplexIor.h  
│ ConductorBxDF.cpp  
│ ConductorBxDF.h  
│ DielectricBxDF.cpp  
│ DielectricBxDF.h  
│ Fresnel.h  
│ GlintBxDF.cpp  
│ GlintBxDF.h  
│ HairBXDF.cpp  
│ HairBXDF.h  
│ LambertainBxDF.cpp  
│ LambertainBxDF.h  
│ LayeredBXDF.cpp  
│ LayeredBXDF.h  
│ MicrofacetDistribution.cpp  
│ MicrofacetDistribution.h  
│ MirrorBxDF.cpp  
│ MirrorBxDF.h  
│ PlasticBxDF.cpp  
│ PlasticBxDF.h  
│  
├─Medium  
│ Beerslaw.cpp  
│ Beerslaw.h  
│ Heterogeneous.cpp  
│ Heterogeneous.h  
│ HGPhase.cpp  
│ HGPhase.h  
│ Homogeneous.cpp  
│ Homogeneous.h  
│ IsotropicPhase.cpp  
│ IsotropicPhase.h  
│ Medium.h  
│ MediumFactory.cpp  
│ MediumFactory.h  
│ Phase.h  
│  
├─Sampler  
│ DirectSampler.cpp  
│ DirectSampler.h  
│ Halton.cpp  
│ Halton.h  
│ Independent.h  
│ Sampler.cpp  
│ Sampler.h  
│ Stratified.cpp  
│ Stratified.h  
│ ZeroTwoSequence.cpp  
│ ZeroTwoSequence.h  
│  
├─Scene  
│ Scene.cpp  
│ Scene.h  
│  
├─Shape  
│ Cube.cpp  
│ Cube.h  
│ Curve.cpp  
│ Curve.h  
│ Entity.cpp  
│ Entity.h  
│ EntityFactory.cpp  
│ EntityFactory.h  
│ Mesh.cpp  
│ Mesh.h  
│ Quad.cpp  
│ Quad.h  
│ Sphere.cpp  
│ Sphere.h  
│ Triangle.cpp  
│ Triangle.h  
│  
├─Texture  
│ ImageTexture.cpp  
│ ImageTexture.h  
│ ProceduralTexture.cpp  
│ ProceduralTexture.h  
│ Texture.h  
│ TextureFactory.h  
│ TextureMapping.cpp  
│ TextureMapping.h  
│  
└─TileGenerator  
SequenceTileGenerator.cpp  
SequenceTileGenerator.h  
TileGenerator.cpp  
TileGenerator.h

\n\n\n\n\n

FunctionLayer在我看来是整个离线渲染器的核心，其中包含的内容围绕着具体的图形学技术细节以及tricks展开，比如图形的BVH加速结构、Distribution采样、纹理、材料、光源等核心方面的内容。所以我们主要针对这一层的各个实现进行解释和拆分

\n\n\n\n

### Acceleration

\n\n\n\n

这一部分主要是为了实现光追的几个基本加速结构，详细的光追加速我就另开一篇文章来解释了

\n\n\n\n
    
    
    /// @brief Acceleration structure Interface.\nclass Accel {\n\npublic:\n\n    Accel() = default;\n\n    /*\n    * @brief basic interface for ray intersection.\n    * @param r The ray that intersect with a scene. This interface will only utilize its geometry information.\n    * @return The exactly closest intersection point on an entity in the scene with other useful information.\n    */\n    virtual std::optional<Intersection> Intersect(const Ray &r) const = 0;\n\n    /*\n    * @brief get the bounding box of all the objects\n    */\n    [[nodiscard]]\n    virtual BoundingBox3f getGlobalBoundingBox() const = 0;\n};

\n\n\n\n

这是整个加速结构的总体interface，包含求交、获得包围盒这两个接口

\n\n\n\n

│Bvh.cpp  
│ Bvh.h  
│ Embree.cpp  
│ Embree.h

\n\n\n\n

implementation包括BVH和Embree两类

\n\n\n\n

BVH里面定义了几个基本的数据结构：

\n\n\n\n
    
    
    /// @brief Entity information declaration for building BVH\nstruct EntityInfo {\n\tEntityInfo(){}\n\tEntityInfo(int _EntityId, const BoundingBox3f& _bounds): EntityId(_EntityId), bounds(_bounds), center(0.5 * (_bounds.pMin + _bounds.pMax)){}\n\tint EntityId;\n\tBoundingBox3f bounds;\n\tPoint3d center;\n};\n\nstruct BvhTreeNode {\n\tBoundingBox3f bounds;\n\tstd::shared_ptr<BvhTreeNode> children[2] = {nullptr, nullptr};//0: left, 1: right\n\tint splitAxis;\n\tint nEntites = 0;//0: interior nodes, otherwise: leaf nodes\n\tint entityOffset;\n};\n\n/// @brief Bvh Nodes in Dfs-Order\nstruct LinearBvhNode {\n\tBoundingBox3f bounds;\n\tunion\n\t{\n\t\tint firstdEntityOffset;//for leaves to enumerate\n\t\tint secondChildOrder;//for interior nodes to traverse\n\t};\n\tint nEntites = 0;\n\tint splitAxis;\n};

\n\n\n\n

[`EntityInfo`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)结构体包含三个成员：

\n\n\n\n

\n
  * [`EntityId`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)：一个整数，用于标识实体。
\n\n\n\n
  * [`bounds`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)：一个`BoundingBox3f`类型的对象，表示实体的包围盒。`BoundingBox3f`是一个自定义的类型，用于存储3D包围盒的信息。
\n\n\n\n
  * [`center`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)：一个`Point3d`类型的对象，表示实体的中心点。`Point3d`也是一个自定义的类型，用于存储3D点的信息。
\n
\n\n\n\n

[`EntityInfo`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)结构体提供了两个构造函数：

\n\n\n\n

\n
  * 默认构造函数[`EntityInfo()`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)：创建一个[`EntityInfo`](<vscode-file://vscode-app/c:/Users/shenjiawei/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html>)对象，但不对其成员进行初始化。
\n\n\n\n
  * 带参数的构造函数`EntityInfo(int _EntityId, const BoundingBox3f& _bounds)`：创建一个`EntityInfo`对象，并使用参数`_EntityId`和`_bounds`初始化`EntityId`和`bounds`成员。同时，它还计算出实体的中心点`center`，方法是取包围盒的最小点和最大点的中点。
\n
\n\n\n\n

\n