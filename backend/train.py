import argparse
import os
from pathlib import Path
from typing import Tuple

import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import confusion_matrix

from .config import (
  ACCURACY_PLOT_PATH,
  CONFUSION_MATRIX_PATH,
  EPOCHS,
  BATCH_SIZE,
  IMAGE_SIZE,
  MODEL_PATH,
  PLANTVILLAGE_DIR,
  VALIDATION_SPLIT,
  ensure_directories,
)
from .utils import setup_logging


def create_generators(batch_size: int) -> Tuple[tf.keras.preprocessing.image.DirectoryIterator, tf.keras.preprocessing.image.DirectoryIterator]:
  if not PLANTVILLAGE_DIR.exists():
    raise FileNotFoundError(f"Dataset directory not found: {PLANTVILLAGE_DIR}")

  datagen = tf.keras.preprocessing.image.ImageDataGenerator(
    rescale=1.0 / 255.0,
    validation_split=VALIDATION_SPLIT,
    horizontal_flip=True,
    zoom_range=0.2,
    rotation_range=20,
  )

  train_gen = datagen.flow_from_directory(
    PLANTVILLAGE_DIR,
    target_size=IMAGE_SIZE,
    batch_size=batch_size,
    class_mode="categorical",
    subset="training",
  )

  val_gen = datagen.flow_from_directory(
    PLANTVILLAGE_DIR,
    target_size=IMAGE_SIZE,
    batch_size=batch_size,
    class_mode="categorical",
    subset="validation",
    shuffle=False,
  )

  return train_gen, val_gen


def build_model(num_classes: int) -> tf.keras.Model:
  base_model = tf.keras.applications.MobileNetV2(
    input_shape=(*IMAGE_SIZE, 3),
    include_top=False,
    weights="imagenet",
  )
  base_model.trainable = False

  inputs = tf.keras.Input(shape=(*IMAGE_SIZE, 3))
  # Training generator normalizes to 0..1; MobileNetV2 expects -1..1
  x = tf.keras.layers.Rescaling(2.0, offset=-1.0)(inputs)
  x = base_model(x, training=False)
  x = tf.keras.layers.GlobalAveragePooling2D()(x)
  x = tf.keras.layers.Dense(256, activation="relu")(x)
  x = tf.keras.layers.Dropout(0.4)(x)
  outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
  model = tf.keras.Model(inputs, outputs, name="crop_disease_mobilenetv2")

  model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-4),
    loss="categorical_crossentropy",
    metrics=["accuracy"],
  )

  return model


def plot_history(history: tf.keras.callbacks.History) -> None:
  ACCURACY_PLOT_PATH.parent.mkdir(parents=True, exist_ok=True)
  acc = history.history.get("accuracy", [])
  val_acc = history.history.get("val_accuracy", [])
  loss = history.history.get("loss", [])
  val_loss = history.history.get("val_loss", [])

  epochs_range = range(1, len(acc) + 1)
  plt.figure(figsize=(10, 4))

  plt.subplot(1, 2, 1)
  plt.plot(epochs_range, acc, label="Train Acc")
  plt.plot(epochs_range, val_acc, label="Val Acc")
  plt.title("Accuracy")
  plt.legend()

  plt.subplot(1, 2, 2)
  plt.plot(epochs_range, loss, label="Train Loss")
  plt.plot(epochs_range, val_loss, label="Val Loss")
  plt.title("Loss")
  plt.legend()

  plt.tight_layout()
  plt.savefig(ACCURACY_PLOT_PATH)
  plt.close()


def plot_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, class_names: list) -> None:
  CONFUSION_MATRIX_PATH.parent.mkdir(parents=True, exist_ok=True)
  cm = confusion_matrix(y_true, y_pred)
  fig, ax = plt.subplots(figsize=(10, 8))
  im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Greens)
  ax.figure.colorbar(im, ax=ax)
  ax.set(
    xticks=np.arange(cm.shape[1]),
    yticks=np.arange(cm.shape[0]),
    xticklabels=class_names,
    yticklabels=class_names,
    ylabel="True label",
    xlabel="Predicted label",
    title="Confusion Matrix",
  )
  plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")

  thresh = cm.max() / 2.0 if cm.size else 0
  for i in range(cm.shape[0]):
    for j in range(cm.shape[1]):
      ax.text(
        j,
        i,
        format(cm[i, j], "d"),
        ha="center",
        va="center",
        color="white" if cm[i, j] > thresh else "black",
      )

  fig.tight_layout()
  plt.savefig(CONFUSION_MATRIX_PATH)
  plt.close()


def train(epochs: int, force: bool = False) -> None:
  ensure_directories()
  logger = setup_logging()

  # Verify dataset directory and count classes/images before training
  if not PLANTVILLAGE_DIR.exists():
    message = f"Dataset directory not found at {PLANTVILLAGE_DIR}"
    logger.error(message)
    raise FileNotFoundError(message)

  class_dirs = [
    p for p in PLANTVILLAGE_DIR.iterdir() if p.is_dir()
  ]
  num_classes_detected = len(class_dirs)

  # Count image files recursively under class folders
  image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".JPG", ".JPEG", ".PNG"}
  image_count = 0
  for class_dir in class_dirs:
    for file_path in class_dir.rglob("*"):
      if file_path.is_file() and file_path.suffix in image_exts:
        image_count += 1

  logger.info(
    "PlantVillage dataset verified at %s; classes=%d, images=%d",
    PLANTVILLAGE_DIR,
    num_classes_detected,
    image_count,
  )
  print(f"DATASET SUMMARY -> classes: {num_classes_detected}, images: {image_count}")

  if num_classes_detected == 0 or image_count == 0:
    message = (
      "PlantVillage dataset appears to be empty. "
      f"Classes detected: {num_classes_detected}, images: {image_count}"
    )
    logger.error(message)
    raise RuntimeError(message)

  if MODEL_PATH.exists() and not force:
    logger.info(
      "Model already exists at %s. Skipping training (use --force to retrain).",
      MODEL_PATH,
    )
    return

  logger.info("Starting training with dataset at %s", PLANTVILLAGE_DIR)

  train_gen, val_gen = create_generators(batch_size=BATCH_SIZE)
  num_classes = train_gen.num_classes
  class_indices = train_gen.class_indices
  logger.info("Detected %d classes: %s", num_classes, list(class_indices.keys()))

  model = build_model(num_classes=num_classes)

  callbacks = [
    tf.keras.callbacks.EarlyStopping(
      monitor="val_accuracy",
      patience=3,
      restore_best_weights=True,
    ),
    tf.keras.callbacks.ModelCheckpoint(
      filepath=str(MODEL_PATH),
      monitor="val_accuracy",
      save_best_only=True,
    ),
  ]

  history = model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=epochs,
  )
  logger.info("Training completed. Saving final model to %s", MODEL_PATH)
  model.save(MODEL_PATH)

  if not MODEL_PATH.exists():
    message = f"Expected trained model at {MODEL_PATH}, but file was not created."
    logger.error(message)
    raise RuntimeError(message)

  logger.info("Generating training history plots.")
  plot_history(history)

  logger.info("Computing confusion matrix on validation data.")
  val_gen.reset()
  predictions = model.predict(val_gen)
  y_pred = np.argmax(predictions, axis=1)
  y_true = val_gen.classes
  class_names = list(class_indices.keys())
  plot_confusion_matrix(y_true, y_pred, class_names)
  logger.info("Training artifacts saved under %s", Path(MODEL_PATH).parents[1])
  print("TRAINING COMPLETED SUCCESSFULLY")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Train crop disease detection model.")
  parser.add_argument("--epochs", type=int, default=EPOCHS, help="Number of training epochs.")
  parser.add_argument(
    "--force",
    action="store_true",
    help="Force retraining even if a model already exists.",
  )
  return parser.parse_args()


if __name__ == "__main__":
  os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
  args = parse_args()
  try:
    train(epochs=args.epochs, force=args.force)
  except Exception as exc:  # noqa: BLE001
    logger = setup_logging()
    logger.exception("Training failed: %s", exc)
    raise SystemExit(1) from exc

