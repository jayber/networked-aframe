/* global assert, process, setup, suite, test */
var aframe = require('aframe');
var helpers = require('./helpers');
var naf = require('../../src/NafIndex');
var NetworkEntities = require('../../src/NetworkEntities');

require('../../src/components/networked-remote');

suite('NetworkEntities', function() {
  var scene;
  var entities;
  var entityData;
  var compressedData;

  function initScene(done) {
    var opts = {
      assets: [
        '<script id="template1" type="text/html"><a-entity></a-entity></script>',
        '<script id="template2" type="text/html"><a-box></a-box></script>',
        '<script id="template3" type="text/html"><a-sphere></a-sphere></script>',
        '<script id="template4" type="text/html"><a-sphere><a-entity class="test-child"></a-entity></a-sphere></script>'
      ]
    };
    scene = helpers.sceneFactory(opts);
    naf.utils.whenEntityLoaded(scene, done);
  }

  setup(function(done) {
    naf.options.useLerp = true;
    naf.schemas.clear();
    entities = new NetworkEntities();
    entityData = {
      0: 0,
      networkId: 'test1',
      owner: 'abcdefg',
      parent: null,
      template: '#template1',
      components: {
        position: '1 2 3',
        rotation: '4 3 2'
      }
    };
    compressedData = [
      1,
      'test1',
      'abcdefg',
      null,
      '#template1',
      {
        0: '1 2 3',
        1: '4 3 2'
      }
    ];
    initScene(done);
    naf.connection.isMineAndConnected = sinon.stub();
  });

  teardown(function() {
    scene.parentElement.removeChild(scene);
  });

  suite('registerLocalEntity', function() {

    test('adds entity to list', function() {
      var entity = 'i-am-entity';
      var networkId = 'nid1';

      entities.registerLocalEntity(networkId, entity);

      var result = entities.getEntity('nid1');
      assert.equal(result, 'i-am-entity');
    });
  });

  suite('createRemoteEntity', function() {

    test('returns entity', function() {
      var entity = entities.createRemoteEntity(entityData);
      assert.isOk(entity);
    });

    test('entity components set immediately', function() {
      var entity = entities.createRemoteEntity(entityData);

      var position = entity.components.position.attrValue;
      var rotation = entity.components.rotation.attrValue;
      var id = entity.getAttribute('id');

      assert.isOk(entity);
      assert.deepEqual(position, {x: 1, y: 2, z: 3});
      assert.deepEqual(rotation, {x: 4, y: 3, z: 2});
    });

    test('entity sets correct first update data', function() {
      var entity = entities.createRemoteEntity(entityData);

      assert.equal(entity.firstUpdateData, entityData);
    });

    test('entity sets correct networked-remote component', function(done) {
      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      naf.utils.whenEntityLoaded(entity, function() {
        var componentData = entity.components['networked-remote'].getData();

        assert.equal(componentData.template, '#template1', 'template');
        assert.equal(componentData.networkId, 'test1', 'networkId');
        assert.equal(componentData.owner, 'abcdefg', 'owner');
        done();
      });
    });

    test('entity added to network list', function() {
      var expected = entities.createRemoteEntity(entityData);
      var result = entities.getEntity(entityData.networkId);
      assert.isOk(result, expected);
    });

    test('entity has correct components when no components schema defined', function(done) {
      entityData.template = '#template3';
      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      naf.utils.whenEntityLoaded(entity, function() {
        var network = entity.getAttribute('networked-remote');

        assert.deepEqual(network.components, ['position', 'rotation']);
        done();
      });
    });

    test('entity has correct advanced components', function(done) {
      entityData.template = '#template2';
      var schema = {
        template: '#template2',
        components: [
          'position',
          {
            selector: '.test-child',
            component: 'visible'
          }
        ]
      };
      naf.schemas.add(schema);

      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      naf.utils.whenEntityLoaded(entity, function() {
        var network = entity.getAttribute('networked-remote');

        assert.deepEqual(network.components, schema.components);
        done();
      });
    });

    test('entity has correct simple components', function(done) {
      entityData.template = '#template2';
      var schema = {
        template: '#template2',
        components: [
          'position'
        ]
      };
      naf.schemas.add(schema);

      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      naf.utils.whenEntityLoaded(entity, function() {
        var network = entity.getAttribute('networked-remote');

        assert.deepEqual(network.components, ['position']);
        done();
      });
    });
  });

  suite('updateEntity', function() {

    test('first uncompressed update creates new entity', sinon.test(function() {
      this.spy(entities, 'createRemoteEntity');

      entities.updateEntity('client', 'u', entityData);

      assert.isTrue(entities.createRemoteEntity.calledWith(entityData));
    }));

    test('second uncompressed update updates entity', function() {
      entities.updateEntity('client', 'u', entityData); // creates entity
      var entity = entities.getEntity(entityData.networkId);
      sinon.spy(entity, 'emit');

      entities.updateEntity('client', 'u', entityData); // updates entity

      assert.isTrue(entity.emit.calledWith('networkUpdate'));
    });

    test('compressed data when entity not created, does not fail', sinon.test(function() {
      this.spy(entities, 'createRemoteEntity');

      entities.updateEntity('client', 'u', compressedData);

      assert.isFalse(entities.createRemoteEntity.called);
    }));

    test('compressed data updates entity', sinon.test(function() {
      this.spy(entities, 'createRemoteEntity');
      entities.updateEntity('client', 'u', entityData); // creates entity
      var entity = entities.getEntity(entityData.networkId);
      sinon.spy(entity, 'emit');

      entities.updateEntity('client', 'u', compressedData);

      assert.isTrue(entities.createRemoteEntity.called);
      assert.isTrue(entity.emit.calledWith('networkUpdate'));
    }));


    test('entity with parent that has not been created is not created yet', sinon.test(function() {
      this.spy(entities, 'createRemoteEntity');
      entityData.parent = 'non-existent-parent';

      entities.updateEntity('client', 'u', entityData);

      assert.isFalse(entities.createRemoteEntity.calledWith(entityData));
    }));

    test('child entities created after parent', sinon.test(function() {
      this.spy(entities, 'createRemoteEntity');
      var entityDataParent = entityData;
      var entityDataChild1 = {
        0: 0,
        networkId: 'test-child-1',
        owner: 'abcdefg',
        parent: 'test1',
        template: '#template1',
        components: {
          position: '1 2 3',
          rotation: '4 3 2'
        }
      };
      var entityDataChild2 = {
        0: 0,
        networkId: 'test-child-2',
        owner: 'abcdefg',
        parent: 'test1',
        template: '#template1',
        components: {
          position: '1 2 3',
          rotation: '4 3 2'
        }
      };

      entities.updateEntity('client', 'u', entityDataChild1);
      entities.updateEntity('client', 'u', entityDataChild2);

      assert.isFalse(entities.createRemoteEntity.calledWith(entityDataChild1), 'does not create child 1');
      assert.isFalse(entities.createRemoteEntity.calledWith(entityDataChild2), 'does not create child 2');

      entities.updateEntity('client', 'u', entityDataParent);

      assert.isTrue(entities.createRemoteEntity.calledWith(entityDataParent), 'creates parent');
      assert.isTrue(entities.createRemoteEntity.calledWith(entityDataChild1), 'creates child 1 after parent');
      assert.isTrue(entities.createRemoteEntity.calledWith(entityDataChild2), 'creates child 2 after parent');
    }));
  });

  suite('completeSync', function() {

    test('no network entities', function() {
      entities.completeSync();
    });

    test('emits sync on 3 entities', function() {
      var entityList = [];
      for (var i = 0; i < 3; i++) {
        entityData.networkId = i;
        var entity = entities.createRemoteEntity(entityData);
        entityList.push(entity);
        sinon.spy(entity, 'emit');
      }
      entities.completeSync();
      for (var i = 0; i < 3; i++) {
        assert.isTrue(entityList[i].emit.calledWith('syncAll'))
      }
    });

    test('emits sync on many entities', function() {
      var entityList = [];
      for (var i = 0; i < 20; i++) {
        entityData.networkId = i;
        var entity = entities.createRemoteEntity(entityData);
        entityList.push(entity);
        sinon.spy(entity, 'emit');
      }
      entities.completeSync();
      for (var i = 0; i < 20; i++) {
        assert.isTrue(entityList[i].emit.calledWith('syncAll'))
      }
    });

    test('does not emit sync on removed entity', function() {
      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      sinon.spy(entity, 'emit');
      entities.removeEntity(entityData.networkId);

      entities.completeSync();

      assert.isFalse(entity.emit.calledWith('syncAll'));
    });
  });

  suite('removeEntity', function() {

    test('correct id', function() {
      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      var removedEntity = entities.removeEntity(entityData.networkId);

      assert.equal(removedEntity, entity);
    });

    test('wrong id', function() {
      var entity = entities.createRemoteEntity(entityData);
      scene.appendChild(entity);

      var result = entities.removeEntity('wrong');

      assert.isNull(result);
    });

    test('no entities', function() {
      var result = entities.removeEntity('wrong');
      assert.isNull(result);
    });
  });

  suite('removeRemoteEntity', function() {

    test('calls removeEntity with id', function() {
      var data = { networkId: 'testId' };
      entities.removeEntity = sinon.stub();

      entities.removeRemoteEntity('client1', 'type1', data);

      assert.isTrue(entities.removeEntity.calledWith('testId'));
    });
  });

  suite('removeEntitiesFromUser', function() {

    test('removing many entities', sinon.test(function() {
      var entityList = [];
      for (var i = 0; i < 3; i++) {
        entityData.networkId = i;
        var entity = entities.createRemoteEntity(entityData);
        scene.appendChild(entity);
        entityList.push(entity);
      }
      this.stub(naf.utils, 'getNetworkOwner').returns(entityData.owner);

      var removedEntities = entities.removeEntitiesFromUser(entityData.owner);

      assert.equal(removedEntities.length, 3);
    }));

    test('other entities', sinon.test(function() {
      var entity = entities.createRemoteEntity(entityData);
      this.stub(naf.utils, 'getNetworkOwner').returns('a');

      var removedEntities = entities.removeEntitiesFromUser('b');

      assert.equal(removedEntities.length, 0);
    }));

    test('no entities', function() {
      var removedEntities = entities.removeEntitiesFromUser(entityData.owner);

      assert.equal(removedEntities.length, 0);
    });
  });

  suite('getEntity', function() {

    test('normal', function() {
      var testEntity = { test: true };
      entities.entities[entityData.networkId] = testEntity;

      var result = entities.getEntity(entityData.networkId);

      assert.equal(result, testEntity);
    });

    test('incorrect id', function() {
      var testEntity = { test: true };
      entities.entities[entityData.networkId] = testEntity;

      var result = entities.getEntity('wrong');

      assert.equal(result, null);
    });
  });

  suite('hasEntity', function() {

    test('normal', function() {
      var testEntity = { test: true };
      entities.entities[entityData.networkId] = testEntity;

      var result = entities.hasEntity(entityData.networkId);

      assert.isTrue(result);
    });

    test('incorrect id', function() {
      var testEntity = { test: true };
      entities.entities[entityData.networkId] = testEntity;

      var result = entities.hasEntity('wrong');

      assert.isFalse(result);
    });
  });
});